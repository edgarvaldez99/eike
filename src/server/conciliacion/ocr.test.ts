import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ocrComprobante } from "./ocr";

const respuesta = (json: unknown) => ({ json: async () => json }) as Response;

describe("ocrComprobante", () => {
  const fetchFalso = vi.fn();

  beforeEach(() => {
    vi.stubEnv("OCR_API_KEY", "clave-de-prueba");
    vi.stubGlobal("fetch", fetchFalso);
    fetchFalso.mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("sin OCR_API_KEY falla antes de llamar a la API", async () => {
    vi.stubEnv("OCR_API_KEY", "");
    await expect(ocrComprobante(Buffer.from("x"), "image/png", "a.png")).rejects.toThrow("OCR_API_KEY");
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it("devuelve el texto leído, uniendo las páginas, y manda la imagen como multipart", async () => {
    fetchFalso.mockResolvedValue(respuesta({ ParsedResults: [{ ParsedText: "uno" }, { ParsedText: "dos" }] }));

    expect(await ocrComprobante(Buffer.from("x"), "image/png", "a.png")).toBe("uno\ndos");

    const [url, opciones] = fetchFalso.mock.calls[0];
    expect(url).toBe("https://api.ocr.space/parse/image");
    const form = opciones.body as FormData;
    expect(form.get("apikey")).toBe("clave-de-prueba");
    expect(form.get("language")).toBe("spa");
    expect(form.get("filetype")).toBeNull();
    expect((form.get("file") as File).name).toBe("a.png");
  });

  it("para un PDF avisa el tipo de archivo", async () => {
    fetchFalso.mockResolvedValue(respuesta({ ParsedResults: [{ ParsedText: "texto" }] }));
    await ocrComprobante(Buffer.from("x"), "application/pdf", "a.pdf");
    expect((fetchFalso.mock.calls[0][1].body as FormData).get("filetype")).toBe("PDF");
  });

  it("si la API reporta un error (lista de mensajes), lo incluye en el motivo", async () => {
    fetchFalso.mockResolvedValue(respuesta({ IsErroredOnProcessing: true, ErrorMessage: ["límite", "excedido"] }));
    await expect(ocrComprobante(Buffer.from("x"), "image/png", "a.png")).rejects.toThrow("OCR sin resultado: límite excedido");
  });

  it("si la API reporta un error (texto), lo incluye en el motivo", async () => {
    fetchFalso.mockResolvedValue(respuesta({ IsErroredOnProcessing: true, ErrorMessage: "clave inválida" }));
    await expect(ocrComprobante(Buffer.from("x"), "image/png", "a.png")).rejects.toThrow("clave inválida");
  });

  it("sin texto y sin mensaje de error → 'sin texto'", async () => {
    fetchFalso.mockResolvedValue(respuesta({ ParsedResults: [{}] }));
    await expect(ocrComprobante(Buffer.from("x"), "image/png", "a.png")).rejects.toThrow("sin texto");
  });

  it("sin resultados parseados → 'sin texto'", async () => {
    fetchFalso.mockResolvedValue(respuesta({}));
    await expect(ocrComprobante(Buffer.from("x"), "image/png", "a.png")).rejects.toThrow("sin texto");
  });
});
