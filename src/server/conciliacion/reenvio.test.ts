import { afterEach, describe, expect, it, vi } from "vitest";

const nodemailerFalso = vi.hoisted(() => ({ sendMail: vi.fn(), createTransport: vi.fn() }));
vi.mock("nodemailer", () => ({ default: { createTransport: nodemailerFalso.createTransport } }));

import { reenviarCorreoBanco, type CorreoParaReenviar } from "./reenvio";

const correo: CorreoParaReenviar = {
  destino: "empresa@test.com",
  asunto: "Transferencia recibida",
  remitenteOriginal: "info@itau.com.py",
  texto: "Monto PYG 724,000",
  html: "<p>Monto</p>",
  original: Buffer.from("From: info@itau.com.py\r\n\r\nhola"),
  verificado: true,
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  nodemailerFalso.sendMail.mockReset();
  nodemailerFalso.createTransport.mockReset();
});

function configurar() {
  vi.stubEnv("CORREO_ENVIO_DEV", "true");
  vi.stubEnv("IMAP_HOST", "mail.test");
  vi.stubEnv("IMAP_USER", "pagos@test");
  vi.stubEnv("IMAP_PASS", "secreto");
  vi.stubEnv("SMTP_HOST", "");
  vi.stubEnv("SMTP_FROM", "");
  nodemailerFalso.createTransport.mockReturnValue({ sendMail: nodemailerFalso.sendMail });
}

describe("reenviarCorreoBanco", () => {
  it("fuera de producción y sin CORREO_ENVIO_DEV no envía", async () => {
    vi.stubEnv("CORREO_ENVIO_DEV", "");
    expect(await reenviarCorreoBanco(correo)).toBe("omitido");
    expect(nodemailerFalso.sendMail).not.toHaveBeenCalled();
  });

  it("sin configuración de correo lo omite con un aviso", async () => {
    vi.stubEnv("CORREO_ENVIO_DEV", "true");
    vi.stubEnv("IMAP_HOST", "");
    vi.stubEnv("SMTP_HOST", "");
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await reenviarCorreoBanco(correo)).toBe("omitido");
    expect(aviso).toHaveBeenCalledWith(expect.stringContaining("Reenvío del correo del banco omitido"));
  });

  it("envía a la empresa con el original adjunto como .eml", async () => {
    configurar();
    expect(await reenviarCorreoBanco(correo)).toBe("enviado");
    expect(nodemailerFalso.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "empresa@test.com",
        subject: "Fwd: Transferencia recibida",
        html: "<p>Monto</p>",
        attachments: [expect.objectContaining({ filename: "aviso-banco.eml", contentType: "message/rfc822", content: correo.original })],
      }),
    );
    expect(nodemailerFalso.sendMail.mock.calls[0][0].text).toContain("info@itau.com.py");
  });

  it("sin firma verificada va solo en texto, con el asunto marcado y una advertencia", async () => {
    configurar();
    await reenviarCorreoBanco({ ...correo, verificado: false });
    const enviado = nodemailerFalso.sendMail.mock.calls[0][0];
    expect(enviado.subject).toBe("[NO VERIFICADO] Fwd: Transferencia recibida");
    expect(enviado.html).toBeUndefined();
    expect(enviado.attachments).toEqual([]);
    expect(enviado.text).toContain("no se pudo verificar la firma");
  });

  it("sin HTML manda solo texto, y si el servidor falla lanza el error", async () => {
    configurar();
    nodemailerFalso.sendMail.mockRejectedValueOnce(new Error("SMTP caído"));
    await expect(reenviarCorreoBanco({ ...correo, html: null })).rejects.toThrow("SMTP caído");
    expect(nodemailerFalso.sendMail.mock.calls[0][0].html).toBeUndefined();
  });
});
