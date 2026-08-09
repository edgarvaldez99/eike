/**
 * URLs públicas de evento: /eventos/{slug}-{id}. El id es la fuente de
 * verdad (no hay columna `slug` en la base — ver plan de migración,
 * sección de estrategia SEO); el slug se calcula acá mismo a partir del
 * nombre. Si la URL no coincide con el slug canónico, la página redirige
 * (301/308) — así un evento renombrado nunca rompe un link ya indexado.
 */

// Rango Unicode de marcas diacríticas combinantes (U+0300–U+036F). Se arma
// con fromCharCode (no como literal en el archivo) para no depender de que
// el archivo se guarde/lea con la codificación correcta en cada editor/terminal.
const DIACRITICOS = new RegExp(
  `[${String.fromCharCode(0x0300)}-${String.fromCharCode(0x036f)}]`,
  "g",
);

export function slugificar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(DIACRITICOS, "") // quita tildes, diéresis, etc. (ñ → n)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function armarSlugEvento(id: number, nombre: string): string {
  const base = slugificar(nombre);
  return base ? `${base}-${id}` : String(id);
}

/** Extrae el id numérico del final de un slug ("mi-evento-47" → 47), o null si no matchea. */
export function idDesdeSlug(param: string): number | null {
  const match = param.match(/-(\d+)$/) ?? param.match(/^(\d+)$/);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isInteger(id) && id > 0 ? id : null;
}
