/**
 * OCR del comprobante por API externa (OCR.space). Decisión de ticketapi
 * (poc/README.md): no se corre Tesseract local para no cargar la VM de 1 GB;
 * validado con un comprobante real. Devuelve el texto leído, o lanza.
 */
export async function ocrComprobante(buffer: Buffer, mime: string, nombre: string): Promise<string> {
  const apiKey = process.env.OCR_API_KEY;
  if (!apiKey) throw new Error("Falta configurar OCR_API_KEY.");

  const form = new FormData();
  form.append("apikey", apiKey);
  form.append("language", "spa");
  form.append("OCREngine", "2");
  form.append("scale", "true");
  if (mime === "application/pdf") form.append("filetype", "PDF");
  form.append("file", new Blob([new Uint8Array(buffer)], { type: mime }), nombre);

  const respuesta = await fetch("https://api.ocr.space/parse/image", {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(60_000),
  });
  const json = (await respuesta.json()) as {
    ParsedResults?: Array<{ ParsedText?: string }>;
    IsErroredOnProcessing?: boolean;
    ErrorMessage?: string | string[];
  };
  const texto = json.ParsedResults?.map((r) => r.ParsedText ?? "").join("\n").trim();
  if (json.IsErroredOnProcessing || !texto) {
    const detalle = Array.isArray(json.ErrorMessage) ? json.ErrorMessage.join(" ") : (json.ErrorMessage ?? "sin texto");
    throw new Error(`OCR sin resultado: ${detalle}`);
  }
  return texto;
}
