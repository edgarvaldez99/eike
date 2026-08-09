/**
 * Valida que un valor sea una ruta interna segura para redirect() — nunca
 * confiar en un "volver"/"next" que venga del cliente sin esto: un Server
 * Action se puede invocar directo por HTTP (sin pasar por la página que
 * arma el campo oculto), así que hay que revalidar acá, no solo al
 * renderizar el formulario. "//evil.com" y "/\evil.com" son ambos formas de
 * open redirect que el navegador trata como absolutas — se rechazan.
 */
export function rutaInternaSegura(valor: unknown, porDefecto = "/"): string {
  if (typeof valor !== "string" || valor.length === 0) return porDefecto;
  if (!valor.startsWith("/")) return porDefecto;
  if (valor.startsWith("//") || valor.startsWith("/\\")) return porDefecto;
  return valor;
}
