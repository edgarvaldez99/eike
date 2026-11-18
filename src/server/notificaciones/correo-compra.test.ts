import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { urlCompra } from "@/lib/url-sitio";

const nodemailerFalso = vi.hoisted(() => ({ sendMail: vi.fn(), createTransport: vi.fn() }));
vi.mock("nodemailer", () => ({ default: { createTransport: nodemailerFalso.createTransport } }));

import { armarCorreoCompra, enviarCorreoCompra, type DatosCorreoCompra } from "./correo-compra";

const base: DatosCorreoCompra = {
  codigo: "ORD-ABCDEF123456",
  nombreComprador: "Ana <b>Pérez</b>",
  email: "ana@example.com",
  eventoNombre: "Festival & Más",
  resultado: "aprobada",
  numeroWhatsapp: "+595991258700",
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("urlCompra", () => {
  it("arma el link de una orden del carrito y de un ticket suelto", () => {
    vi.stubEnv("SITE_URL", "https://eike.com.py/");
    expect(urlCompra("ORD-ABCDEF123456")).toBe("https://eike.com.py/entradas/orden/ORD-ABCDEF123456");
    expect(urlCompra("EIK-7976371AA59F")).toBe("https://eike.com.py/entradas/EIK-7976371AA59F");
  });

  it("cae a localhost si no hay SITE_URL", () => {
    vi.stubEnv("SITE_URL", "");
    expect(urlCompra("EIK-7976371AA59F")).toBe("http://localhost:3000/entradas/EIK-7976371AA59F");
  });
});

describe("armarCorreoCompra", () => {
  it("compra aprobada: incluye el link para volver a las entradas", () => {
    vi.stubEnv("SITE_URL", "https://eike.com.py");
    const { asunto, texto, html } = armarCorreoCompra(base);
    expect(asunto).toContain("aprobada");
    expect(texto).toContain("https://eike.com.py/entradas/orden/ORD-ABCDEF123456");
    expect(html).toContain('href="https://eike.com.py/entradas/orden/ORD-ABCDEF123456"');
  });

  it("compra rechazada: explica cómo reclamar y no incluye el link", () => {
    const { asunto, texto } = armarCorreoCompra({ ...base, resultado: "rechazada" });
    expect(asunto).toContain("No pudimos verificar");
    expect(texto).toContain("+595991258700");
    expect(texto).not.toContain("/entradas/");
  });

  it("rechazada sin número de WhatsApp: pide responder al correo", () => {
    const { texto } = armarCorreoCompra({ ...base, resultado: "rechazada", numeroWhatsapp: null });
    expect(texto).toContain("respondé a este correo");
  });

  it("escapa el HTML de los datos del comprador", () => {
    const { html } = armarCorreoCompra(base);
    expect(html).not.toContain("<b>Pérez</b>");
    expect(html).toContain("Ana &lt;b&gt;Pérez&lt;/b&gt;");
    expect(html).toContain("Festival &amp; Más");
  });
});

describe("armarCorreoCompra: botón de acción", () => {
  it("rechazada con número: ofrece escribir por WhatsApp con un mensaje ya armado", () => {
    const { html } = armarCorreoCompra({ ...base, resultado: "rechazada" });
    expect(html).toContain("Escribir por WhatsApp");
    expect(html).toContain("https://wa.me/595991258700?text=");
    expect(html).not.toContain("Ver mis entradas");
  });

  it("rechazada sin número: no hay botón", () => {
    const { html } = armarCorreoCompra({ ...base, resultado: "rechazada", numeroWhatsapp: null });
    expect(html).not.toContain("wa.me");
    expect(html).not.toContain("Ver mis entradas");
  });
});

describe("enviarCorreoCompra", () => {
  beforeEach(() => {
    nodemailerFalso.sendMail.mockReset();
    nodemailerFalso.sendMail.mockResolvedValue({});
    nodemailerFalso.createTransport.mockReset();
    nodemailerFalso.createTransport.mockReturnValue({ sendMail: nodemailerFalso.sendMail });
    for (const nombre of ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"]) vi.stubEnv(nombre, "");
    vi.stubEnv("IMAP_HOST", "imap.test");
    vi.stubEnv("IMAP_USER", "ventas@test");
    vi.stubEnv("IMAP_PASS", "secreto");
    vi.stubEnv("CORREO_ENVIO_DEV", "true");
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fuera de producción y sin CORREO_ENVIO_DEV no envía (y lo avisa en el log)", async () => {
    vi.stubEnv("CORREO_ENVIO_DEV", "");
    expect(await enviarCorreoCompra(base)).toBe("omitido");
    expect(nodemailerFalso.createTransport).not.toHaveBeenCalled();
    expect(console.info).toHaveBeenCalledWith(expect.stringContaining("CORREO_ENVIO_DEV=true"));
  });

  it("con el envío habilitado pero sin credenciales, se omite con una advertencia", async () => {
    vi.stubEnv("IMAP_PASS", "");
    expect(await enviarCorreoCompra(base)).toBe("omitido");
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("SMTP_*"));
  });

  it("por defecto envía con la cuenta del buzón de pagos (IMAP_*), por TLS en el 465", async () => {
    expect(await enviarCorreoCompra(base)).toBe("enviado");

    expect(nodemailerFalso.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ host: "imap.test", port: 465, secure: true, auth: { user: "ventas@test", pass: "secreto" } }),
    );
    expect(nodemailerFalso.sendMail).toHaveBeenCalledWith({
      from: { name: "Eike", address: "ventas@test" },
      to: "ana@example.com",
      subject: expect.stringContaining("aprobada"),
      text: expect.stringContaining("Ana <b>Pérez</b>"),
      html: expect.stringContaining("Ana &lt;b&gt;Pérez&lt;/b&gt;"),
    });
  });

  it("SMTP_* tiene prioridad sobre IMAP_*; el 587 usa STARTTLS y SMTP_FROM fija el remitente", async () => {
    vi.stubEnv("SMTP_HOST", "smtp.test");
    vi.stubEnv("SMTP_PORT", "587");
    vi.stubEnv("SMTP_USER", "salida@test");
    vi.stubEnv("SMTP_PASS", "otra");
    vi.stubEnv("SMTP_FROM", "no-responder@test");

    await enviarCorreoCompra(base);

    expect(nodemailerFalso.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ host: "smtp.test", port: 587, secure: false, auth: { user: "salida@test", pass: "otra" } }),
    );
    expect(nodemailerFalso.sendMail).toHaveBeenCalledWith(expect.objectContaining({ from: { name: "Eike", address: "no-responder@test" } }));
  });

  it("en producción envía siempre, sin CORREO_ENVIO_DEV", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CORREO_ENVIO_DEV", "");
    expect(await enviarCorreoCompra(base)).toBe("enviado");
  });

  it("si el servidor de correo falla, el error se propaga a quien llama", async () => {
    nodemailerFalso.sendMail.mockRejectedValue(new Error("certificate has expired"));
    await expect(enviarCorreoCompra(base)).rejects.toThrow("certificate has expired");
  });
});
