import { MAX_BYTES } from "@/lib/archivos/comprobante";

export const VERSION_GRAPH = () => process.env.WHATSAPP_GRAPH_VERSION ?? "v23.0";

const ERROR_TAMANO = `El archivo supera el máximo permitido (${MAX_BYTES / 1024 / 1024} MB).`;

/**
 * Lee el cuerpo respetando un tope: corta la descarga en cuanto lo supera, en
 * vez de bajar todo a memoria y recién después medir (con la RAM acotada de la
 * VM, un archivo enorme podría tirar el proceso).
 */
async function leerConLimite(respuesta: Response, maximo: number): Promise<Buffer> {
  const lector = respuesta.body?.getReader();
  if (!lector) return Buffer.alloc(0);
  const partes: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximo) {
      await lector.cancel();
      throw new Error(ERROR_TAMANO);
    }
    partes.push(value);
  }
  return Buffer.concat(partes);
}

/** Descarga un archivo recibido por WhatsApp (2 pasos de la Cloud API: pedir
 * la URL temporal del media y bajar el binario, ambos con el Bearer token).
 * Se rechaza por tamaño apenas se sabe (el file_size que informa Meta, o el
 * Content-Length) y, si no, mientras se descarga. */
export async function descargarMedia(mediaId: string): Promise<{ buffer: Buffer; mime: string }> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token) throw new Error("Falta configurar WHATSAPP_ACCESS_TOKEN.");
  const auth = { Authorization: `Bearer ${token}` };

  const info = await fetch(`https://graph.facebook.com/${VERSION_GRAPH()}/${encodeURIComponent(mediaId)}`, {
    headers: auth,
    signal: AbortSignal.timeout(30_000),
  });
  const datos = (await info.json()) as { url?: string; mime_type?: string; file_size?: number; error?: { message?: string } };
  if (!datos.url) throw new Error(`Meta no devolvió la URL del media: ${datos.error?.message ?? info.status}`);
  if (Number(datos.file_size) > MAX_BYTES) throw new Error(ERROR_TAMANO);

  const binario = await fetch(datos.url, { headers: auth, signal: AbortSignal.timeout(60_000) });
  if (!binario.ok) throw new Error(`No se pudo descargar el media (${binario.status}).`);
  if (Number(binario.headers.get("content-length")) > MAX_BYTES) throw new Error(ERROR_TAMANO);
  return { buffer: await leerConLimite(binario, MAX_BYTES), mime: datos.mime_type ?? "application/octet-stream" };
}
