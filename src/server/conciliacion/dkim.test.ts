import { generateKeyPairSync } from "node:crypto";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { dkimSign } from "mailauth";
import { dkimAutenticaRemitente, dominioDe, dominiosAlineados } from "./dkim";

function par() {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return {
    privada: privateKey.export({ type: "pkcs1", format: "pem" }).toString(),
    publicaBase64: publicKey.export({ type: "spki", format: "der" }).toString("base64"),
  };
}

const mensaje = (from: string, cuerpo = "Transferencia recibida Gs 5.000") =>
  `From: Banco <${from}>\r\nTo: pagos@eike.test\r\nSubject: Aviso\r\nDate: Mon, 16 Nov 2026 20:30:30 -0300\r\nMessage-ID: <aviso-1@banco.test>\r\n\r\n${cuerpo}\r\n`;

async function firmar(texto: string, dominio: string, privada: string) {
  const r = await dkimSign(texto, { signatureData: [{ signingDomain: dominio, selector: "s1", privateKey: privada }] });
  return Buffer.from(r.signatures + texto);
}

describe("dkimAutenticaRemitente", () => {
  let banco: ReturnType<typeof par>;
  let atacante: ReturnType<typeof par>;
  // DNS simulado: cada dominio publica SU clave. El atacante solo controla evil.test.
  const resolver = async (dominio: string, tipo: string) => {
    if (tipo !== "TXT") return [];
    if (dominio === "s1._domainkey.familiar.com.py") return [[`v=DKIM1; k=rsa; p=${banco.publicaBase64}`]];
    if (dominio === "s1._domainkey.evil.test") return [[`v=DKIM1; k=rsa; p=${atacante.publicaBase64}`]];
    throw Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" });
  };
  beforeAll(() => {
    banco = par();
    atacante = par();
  });

  it("acepta un correo del banco firmado con su propia clave", async () => {
    const correo = await firmar(mensaje("info@familiar.com.py"), "familiar.com.py", banco.privada);
    expect(await dkimAutenticaRemitente(correo, "info@familiar.com.py", resolver)).toBe(true);
  });

  it("rechaza si el cuerpo fue alterado después de firmar (ej. cambiar el monto)", async () => {
    const correo = await firmar(mensaje("info@familiar.com.py"), "familiar.com.py", banco.privada);
    const alterado = Buffer.from(correo.toString().replace("Gs 5.000", "Gs 500.000"));
    expect(await dkimAutenticaRemitente(alterado, "info@familiar.com.py", resolver)).toBe(false);
  });

  it("rechaza un From falsificado: firma válida pero de OTRO dominio (el del atacante)", async () => {
    const correo = await firmar(mensaje("info@familiar.com.py"), "evil.test", atacante.privada);
    expect(await dkimAutenticaRemitente(correo, "info@familiar.com.py", resolver)).toBe(false);
  });

  it("rechaza un correo sin firma, aunque el From diga ser el banco", async () => {
    expect(await dkimAutenticaRemitente(Buffer.from(mensaje("info@familiar.com.py")), "info@familiar.com.py", resolver)).toBe(false);
  });

  it("rechaza si el remitente evaluado no coincide con el From firmado", async () => {
    const correo = await firmar(mensaje("info@familiar.com.py"), "familiar.com.py", banco.privada);
    expect(await dkimAutenticaRemitente(correo, "otro@itau.com.py", resolver)).toBe(false);
  });

  it("rechaza (sin romper) si el DNS del dominio firmante no responde", async () => {
    const correo = await firmar(mensaje("info@familiar.com.py"), "familiar.com.py", banco.privada);
    const caido = async () => {
      throw new Error("timeout");
    };
    expect(await dkimAutenticaRemitente(correo, "info@familiar.com.py", caido)).toBe(false);
  });
});

describe("dkimAutenticaRemitente: casos límite", () => {
  const sinDns = async () => [];
  const CRLF = String.fromCharCode(13, 10);

  it("rechaza un correo con dos encabezados From (ambiguo)", async () => {
    const doble = Buffer.from(mensaje("info@familiar.com.py").replace("To:", "From: otro@evil.test" + CRLF + "To:"));
    expect(await dkimAutenticaRemitente(doble, "info@familiar.com.py", sinDns)).toBe(false);
  });

  it("ante un error inesperado (mensaje inválido) devuelve false en vez de romper", async () => {
    expect(await dkimAutenticaRemitente(undefined as unknown as Buffer, "info@familiar.com.py", sinDns)).toBe(false);
  });

  describe("resolvedor DNS configurable", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("con CONCILIACION_DNS_SERVERS consulta esos servidores (inalcanzables → false, sin romper)", async () => {
      vi.stubEnv("CONCILIACION_DNS_SERVERS", " 127.0.0.1 , ");
      const firmado = await firmar(mensaje("info@familiar.com.py"), "familiar.com.py", par().privada);
      expect(await dkimAutenticaRemitente(firmado, "info@familiar.com.py")).toBe(false);
    });

    it("sin CONCILIACION_DNS_SERVERS (o vacía) usa el resolvedor del sistema", async () => {
      vi.stubEnv("CONCILIACION_DNS_SERVERS", "");
      expect(await dkimAutenticaRemitente(Buffer.from(mensaje("info@familiar.com.py")), "info@familiar.com.py")).toBe(false);
      vi.stubEnv("CONCILIACION_DNS_SERVERS", undefined);
      expect(await dkimAutenticaRemitente(Buffer.from(mensaje("info@familiar.com.py")), "info@familiar.com.py")).toBe(false);
    });
  });
});

describe("dominios", () => {
  it("dominioDe toma lo que sigue a la última @", () => {
    expect(dominioDe("Info@Mail.Itau.com.py")).toBe("mail.itau.com.py");
  });
  it("alineación relaxed: mismo dominio o subdominio; nunca dominios parecidos", () => {
    expect(dominiosAlineados("familiar.com.py", "familiar.com.py")).toBe(true);
    expect(dominiosAlineados("familiar.com.py", "mail.familiar.com.py")).toBe(true);
    expect(dominiosAlineados("mail.familiar.com.py", "familiar.com.py")).toBe(true);
    expect(dominiosAlineados("evil.test", "familiar.com.py")).toBe(false);
    expect(dominiosAlineados("familiar.com.py.evil.test", "familiar.com.py")).toBe(false);
    expect(dominiosAlineados("xfamiliar.com.py", "familiar.com.py")).toBe(false);
  });
});
