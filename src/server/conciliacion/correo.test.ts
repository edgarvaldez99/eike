import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db/cliente";
import { avisosBanco } from "@/db/esquema";
import { editarCorreoReenvioBanco } from "@/server/cuenta";
import { crearOrden, crearUsuario } from "@/test/fixtures";

// ---- Dobles de imapflow / mailparser / dkim ---------------------------------
interface CorreoFalso {
  /** `null` = el servidor no devuelve el mensaje; `""` = lo devuelve sin contenido. */
  source?: string | null;
  text?: string;
  html?: string;
  from?: string | null;
  messageId?: string;
  /** Si está, simpleParser lanza esto (un Error o cualquier otro valor). */
  falla?: unknown;
  /** Encabezados extra del correo (ej. "resent-from" de un reenvío sin modificar). */
  encabezados?: string[];
}

const falso = vi.hoisted(() => ({
  uids: [] as number[] | null,
  correos: new Map<number, unknown>(),
  buscarFalla: false,
  marcados: [] as string[],
  liberado: false,
  cerrado: false,
  opciones: undefined as unknown,
  dkim: true,
}));

vi.mock("imapflow", () => ({
  ImapFlow: class {
    constructor(opciones: unknown) {
      falso.opciones = opciones;
    }
    async connect() {}
    async getMailboxLock() {
      return { release: () => void (falso.liberado = true) };
    }
    async search() {
      if (falso.buscarFalla) throw new Error("fallo IMAP");
      return falso.uids;
    }
    async fetchOne(uid: string) {
      const c = falso.correos.get(Number(uid)) as CorreoFalso | null;
      if (c === null || c.source === null) return null; // el servidor no devuelve el mensaje
      if (c.source === "") return {}; // devuelve el mensaje pero sin contenido
      return { source: Buffer.from(`uid-${uid}`) };
    }
    async messageFlagsAdd(uid: string) {
      falso.marcados.push(uid);
    }
    async logout() {
      falso.cerrado = true;
    }
  },
}));

vi.mock("mailparser", () => ({
  simpleParser: async (source: Buffer) => {
    const uid = Number(source.toString().replace("uid-", ""));
    const c = falso.correos.get(uid) as CorreoFalso;
    if (c?.falla !== undefined) throw c.falla;
    return {
      text: c.text,
      html: c.html,
      messageId: c.messageId,
      headers: new Map((c.encabezados ?? []).map((h) => [h, "x"])),
      from: c.from === null ? undefined : { value: [{ address: c.from ?? "Info@Itau.com.py" }] },
    };
  },
}));

vi.mock("./dkim", () => ({ dkimAutenticaRemitente: async () => falso.dkim }));

const reenvioFalso = vi.hoisted(() => ({ reenviarCorreoBanco: vi.fn() }));
vi.mock("./reenvio", () => reenvioFalso);

import { leerCorreoBanco } from "./correo";

const AVISO = `Concepto de la Transferencia:    MOTO
Cliente Pagador:    ANA PEREZ
Moneda y Monto:    PYG 724,000
Nro. de operación:    OP-1`;

function correos(...lista: Array<[number, CorreoFalso | null]>) {
  falso.uids = lista.map(([uid]) => uid);
  for (const [uid, c] of lista) falso.correos.set(uid, c);
}

const avisoDe = (uid: number, sobre: CorreoFalso = {}): [number, CorreoFalso] => [
  uid,
  { text: AVISO.replace("OP-1", `OP-${uid}`), messageId: `<m${uid}@test>`, ...sobre },
];

describe("leerCorreoBanco", () => {
  beforeEach(() => {
    falso.uids = [];
    falso.correos.clear();
    falso.buscarFalla = false;
    falso.marcados = [];
    falso.liberado = false;
    falso.cerrado = false;
    falso.opciones = undefined;
    falso.dkim = true;
    vi.stubEnv("IMAP_HOST", "imap.test");
    vi.stubEnv("IMAP_USER", "ventas@test");
    vi.stubEnv("IMAP_PASS", "secreto");
    vi.stubEnv("IMAP_PORT", "");
    vi.stubEnv("CONCILIACION_REMITENTES", "");
    vi.stubEnv("CONCILIACION_EXIGIR_DKIM", "");
    vi.stubEnv("CONCILIACION_CUENTAS", "");
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("sin configuración IMAP falla con un mensaje claro", async () => {
    vi.stubEnv("IMAP_PASS", "");
    await expect(leerCorreoBanco()).rejects.toThrow("IMAP_HOST, IMAP_USER e IMAP_PASS");
  });

  it("buzón vacío (o sin lista de UIDs): resumen en cero, y se cierra la conexión", async () => {
    falso.uids = null;
    const resumen = await leerCorreoBanco();
    expect(resumen).toEqual({
      revisados: 0,
      conciliados: 0,
      confirmados: 0,
      sinCruzar: 0,
      ambiguos: 0,
      descartados: 0,
      duplicados: 0,
      ignorados: 0,
      errores: 0,
    });
    expect(falso.liberado).toBe(true);
    expect(falso.cerrado).toBe(true);
  });

  it("se conecta con TLS al puerto 993 por defecto, o al de IMAP_PORT", async () => {
    await leerCorreoBanco();
    expect(falso.opciones).toMatchObject({ host: "imap.test", port: 993, secure: true, auth: { user: "ventas@test", pass: "secreto" } });
    vi.stubEnv("IMAP_PORT", "1993");
    await leerCorreoBanco();
    expect(falso.opciones).toMatchObject({ port: 1993 });
  });

  it("un aviso del banco que coincide con una orden pendiente queda conciliado y el correo se marca como leído", async () => {
    const organizadorId = await crearUsuario({ rol: "organizador" });
    await crearOrden({ organizadorId, estado: "pendiente", subtotal: 724000 });
    correos(avisoDe(7));

    const resumen = await leerCorreoBanco();

    expect(resumen).toMatchObject({ revisados: 1, conciliados: 1, errores: 0 });
    expect(falso.marcados).toEqual(["7"]);
    const [fila] = await db.select().from(avisosBanco);
    expect(fila).toMatchObject({ estado: "conciliado", remitente: "info@itau.com.py", autenticado: true, monto: 724000 });
  });

  it("si el correo no trae texto plano, lee el HTML", async () => {
    correos(avisoDe(1, { text: "  ", html: "<div>Concepto de la Transferencia: MOTO</div><div>Moneda y Monto: PYG 724,000</div>" }));
    expect((await leerCorreoBanco()).sinCruzar).toBe(1);
  });

  it("un correo sin texto ni HTML, o que no es un aviso, se ignora (pero se marca leído)", async () => {
    correos(avisoDe(1, { text: undefined, html: undefined }), avisoDe(2, { text: "Hola, ¿cómo estás?" }));
    const resumen = await leerCorreoBanco();
    expect(resumen).toMatchObject({ revisados: 2, ignorados: 2 });
    expect(falso.marcados).toEqual(["1", "2"]);
    expect(await db.select().from(avisosBanco)).toHaveLength(0);
  });

  it("clasifica cada resultado: sin cruzar, ambiguo y duplicado", async () => {
    const organizadorId = await crearUsuario({ rol: "organizador" });
    await crearOrden({ organizadorId, estado: "pendiente", subtotal: 100 });
    await crearOrden({ organizadorId, estado: "pendiente", subtotal: 100 });
    correos(
      avisoDe(1), // 724.000: sin orden → sin_cruzar
      avisoDe(2, { text: AVISO.replace("724,000", "100").replace("OP-1", "OP-2") }), // dos órdenes → ambiguo
      avisoDe(3, { messageId: "<m1@test>" }), // mismo Message-ID que el 1 → duplicado
    );
    const resumen = await leerCorreoBanco();
    expect(resumen).toMatchObject({ sinCruzar: 1, ambiguos: 1, duplicados: 1 });
  });

  it("sin Message-ID usa uno propio basado en el usuario y el UID", async () => {
    correos(avisoDe(9, { messageId: undefined }));
    await leerCorreoBanco();
    const [fila] = await db.select().from(avisosBanco);
    expect(fila.messageId).toBe("imap-ventas@test-9");
  });

  describe("anti-falsificación", () => {
    it("un remitente que no es del banco se descarta, aunque el monto coincida", async () => {
      const organizadorId = await crearUsuario({ rol: "organizador" });
      await crearOrden({ organizadorId, estado: "pendiente", subtotal: 724000 });
      correos(avisoDe(1, { from: "estafa@evil.com" }));
      expect(await leerCorreoBanco()).toMatchObject({ descartados: 1, conciliados: 0 });
    });

    it("un correo sin remitente se descarta y no se pregunta por su firma", async () => {
      correos(avisoDe(1, { from: null }));
      expect(await leerCorreoBanco()).toMatchObject({ descartados: 1 });
    });

    it("con CONCILIACION_REMITENTES sin definir rige la lista por defecto (Itaú, Familiar, UENO)", async () => {
      vi.stubEnv("CONCILIACION_REMITENTES", undefined);
      correos(avisoDe(1, { from: "info@itau.com.py" }), avisoDe(2, { from: "yo@gmail.com" }));
      expect(await leerCorreoBanco()).toMatchObject({ sinCruzar: 1, descartados: 1 });
    });

    it("CONCILIACION_REMITENTES reemplaza la lista por defecto (ignora entradas vacías)", async () => {
      vi.stubEnv("CONCILIACION_REMITENTES", "mibanco.com.py, ,");
      correos(avisoDe(1, { from: "avisos@mibanco.com.py" }), avisoDe(2, { from: "info@itau.com.py" }));
      expect(await leerCorreoBanco()).toMatchObject({ sinCruzar: 1, descartados: 1 });
    });

    it('CONCILIACION_REMITENTES="*" acepta a cualquiera fuera de producción', async () => {
      vi.stubEnv("CONCILIACION_REMITENTES", "*");
      correos(avisoDe(1, { from: "yo@gmail.com" }));
      expect(await leerCorreoBanco()).toMatchObject({ sinCruzar: 1, descartados: 0 });
    });

    it('en producción CONCILIACION_REMITENTES="*" se ignora (con aviso) y la firma DKIM es obligatoria', async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("CONCILIACION_REMITENTES", "*");
      falso.dkim = false;
      correos(avisoDe(1, { from: "yo@gmail.com" }), avisoDe(2, { from: "info@itau.com.py" }));

      const resumen = await leerCorreoBanco();

      expect(resumen).toMatchObject({ descartados: 2 }); // gmail: no autorizado; itau: sin firma válida
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("se ignora en producción"));
    });

    it("en producción un correo del banco con firma válida se acepta", async () => {
      vi.stubEnv("NODE_ENV", "production");
      correos(avisoDe(1));
      expect(await leerCorreoBanco()).toMatchObject({ sinCruzar: 1, descartados: 0 });
    });

    it("un correo reenviado sin modificar (Resent-*) se descarta aunque la firma del banco siga válida", async () => {
      correos(avisoDe(1, { encabezados: ["resent-from"] }), avisoDe(2, { encabezados: ["resent-message-id"] }));
      expect(await leerCorreoBanco()).toMatchObject({ descartados: 2, sinCruzar: 0 });
    });

    it("con CONCILIACION_CUENTAS, un aviso de Itaú a otra cuenta se descarta y a la propia se acepta", async () => {
      vi.stubEnv("CONCILIACION_CUENTAS", " 26523697 , ");
      correos(
        avisoDe(1, { text: `Nro. de cuenta crédito:    0000000026523697
${AVISO}` }),
        avisoDe(2, { text: `Nro. de cuenta crédito:    0000000099999999
${AVISO.replace("OP-1", "OP-2")}` }),
      );
      expect(await leerCorreoBanco()).toMatchObject({ sinCruzar: 1, descartados: 1 });
    });

    it("sin CONCILIACION_CUENTAS definida no se verifica la cuenta destino", async () => {
      vi.stubEnv("CONCILIACION_CUENTAS", undefined);
      correos(avisoDe(1, { text: `Nro. de cuenta crédito:    0000000099999999
${AVISO}` }));
      expect(await leerCorreoBanco()).toMatchObject({ sinCruzar: 1, descartados: 0 });
    });

    it("fuera de producción, CONCILIACION_EXIGIR_DKIM=true también exige la firma", async () => {
      vi.stubEnv("CONCILIACION_EXIGIR_DKIM", "true");
      falso.dkim = false;
      correos(avisoDe(1));
      expect(await leerCorreoBanco()).toMatchObject({ descartados: 1 });
    });

    it("fuera de producción y sin exigirla, una firma inválida no descarta el correo", async () => {
      falso.dkim = false;
      correos(avisoDe(1));
      expect(await leerCorreoBanco()).toMatchObject({ sinCruzar: 1, descartados: 0 });
    });
  });

  describe("reenvío a la empresa", () => {
    async function configurarDestino(correo: string | null = "empresa@test.com") {
      const id = await crearUsuario({ rol: "superadmin" });
      await editarCorreoReenvioBanco(id, correo);
    }

    it("reenvía cada correo del banco al correo configurado (original adjunto) y lo marca leído", async () => {
      await configurarDestino();
      reenvioFalso.reenviarCorreoBanco.mockResolvedValue("enviado");
      correos(avisoDe(1, { html: "<p>hola</p>" }));
      await leerCorreoBanco();
      expect(reenvioFalso.reenviarCorreoBanco).toHaveBeenCalledTimes(1);
      expect(reenvioFalso.reenviarCorreoBanco).toHaveBeenCalledWith(
        expect.objectContaining({
          destino: "empresa@test.com",
          asunto: "(sin asunto)",
          remitenteOriginal: "info@itau.com.py",
          html: "<p>hola</p>",
          original: Buffer.from("uid-1"),
          verificado: true,
        }),
      );
      expect(falso.marcados).toEqual(["1"]);
    });

    it("también reenvía un correo del banco que no es un aviso de transferencia", async () => {
      await configurarDestino();
      reenvioFalso.reenviarCorreoBanco.mockResolvedValue("enviado");
      correos([1, { text: "Resumen de su cuenta", messageId: "<r@test>" }]);
      const resumen = await leerCorreoBanco();
      expect(resumen.ignorados).toBe(1);
      expect(reenvioFalso.reenviarCorreoBanco).toHaveBeenCalledWith(expect.objectContaining({ html: null }));
    });

    it("con la firma del banco inválida lo reenvía igual, pero marcado como no verificado", async () => {
      await configurarDestino();
      reenvioFalso.reenviarCorreoBanco.mockClear();
      reenvioFalso.reenviarCorreoBanco.mockResolvedValue("enviado");
      falso.dkim = false;
      correos(avisoDe(1), [2, { text: "Resumen", messageId: "<r2@test>" }]);
      await leerCorreoBanco();
      expect(reenvioFalso.reenviarCorreoBanco).toHaveBeenCalledTimes(2);
      expect(reenvioFalso.reenviarCorreoBanco).toHaveBeenNthCalledWith(1, expect.objectContaining({ verificado: false }));
      expect(reenvioFalso.reenviarCorreoBanco).toHaveBeenNthCalledWith(2, expect.objectContaining({ verificado: false }));
    });

    it("no reenvía si no hay correo configurado, o si el remitente no es del banco", async () => {
      reenvioFalso.reenviarCorreoBanco.mockClear();
      correos(avisoDe(1));
      await leerCorreoBanco();
      await configurarDestino();
      correos(avisoDe(2, { from: "estafa@malo.com" }), avisoDe(3, { from: null }));
      await leerCorreoBanco();
      expect(reenvioFalso.reenviarCorreoBanco).not.toHaveBeenCalled();
    });

    it("si el reenvío falla, cuenta como error y el correo queda sin leer para reintentar", async () => {
      await configurarDestino();
      reenvioFalso.reenviarCorreoBanco.mockRejectedValueOnce(new Error("SMTP caído"));
      correos(avisoDe(1));
      const resumen = await leerCorreoBanco();
      expect(resumen.errores).toBe(1);
      expect(falso.marcados).toEqual([]);
    });
  });

  describe("errores por correo", () => {
    it("un mensaje que el servidor no devuelve, o devuelve sin contenido, cuenta como error y no se marca leído", async () => {
      correos([1, null], [2, { source: null }], [3, { source: "" }]);
      const resumen = await leerCorreoBanco();
      expect(resumen).toMatchObject({ revisados: 3, errores: 3 });
      expect(falso.marcados).toEqual([]);
    });

    it("un error no frena el resto del buzón (sea Error o cualquier otro valor lanzado)", async () => {
      correos([1, { falla: new Error("MIME roto") }], [2, { falla: "texto suelto" }], avisoDe(3));
      const resumen = await leerCorreoBanco();
      expect(resumen).toMatchObject({ revisados: 3, errores: 2, sinCruzar: 1 });
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining("UID 1"), "MIME roto");
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining("UID 2"), "texto suelto");
    });

    it("si falla la búsqueda, igual libera el buzón y cierra la conexión", async () => {
      falso.buscarFalla = true;
      await expect(leerCorreoBanco()).rejects.toThrow("fallo IMAP");
      expect(falso.liberado).toBe(true);
      expect(falso.cerrado).toBe(true);
    });
  });
});
