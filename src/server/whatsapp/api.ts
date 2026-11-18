const VERSION_GRAPH = () => process.env.WHATSAPP_GRAPH_VERSION ?? "v23.0";

/** Descarga un archivo recibido por WhatsApp (2 pasos de la Cloud API: pedir
 * la URL temporal del media y bajar el binario, ambos con el Bearer token). */
export async function descargarMedia(mediaId: string): Promise<{ buffer: Buffer; mime: string }> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token) throw new Error("Falta configurar WHATSAPP_ACCESS_TOKEN.");
  const auth = { Authorization: `Bearer ${token}` };

  const info = await fetch(`https://graph.facebook.com/${VERSION_GRAPH()}/${encodeURIComponent(mediaId)}`, {
    headers: auth,
    signal: AbortSignal.timeout(30_000),
  });
  const datos = (await info.json()) as { url?: string; mime_type?: string; error?: { message?: string } };
  if (!datos.url) throw new Error(`Meta no devolvió la URL del media: ${datos.error?.message ?? info.status}`);

  const binario = await fetch(datos.url, { headers: auth, signal: AbortSignal.timeout(60_000) });
  if (!binario.ok) throw new Error(`No se pudo descargar el media (${binario.status}).`);
  return { buffer: Buffer.from(await binario.arrayBuffer()), mime: datos.mime_type ?? "application/octet-stream" };
}
