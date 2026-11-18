/** URL pública del sitio, sin barra final. SITE_URL en producción; localhost en desarrollo. */
export function origenSitio(): string {
  return (process.env.SITE_URL || "http://localhost:3000").replace(/\/+$/, "");
}

/**
 * Link absoluto para volver a ver una compra. Los códigos "ORD-…" son de una
 * orden del carrito (/entradas/orden/…); los "EIK-…" son de un ticket suelto
 * (/entradas/…). El código es la credencial de acceso, no hace falta sesión.
 */
export function urlCompra(codigo: string): string {
  const ruta = codigo.startsWith("ORD-") ? `/entradas/orden/${codigo}` : `/entradas/${codigo}`;
  return `${origenSitio()}${ruta}`;
}
