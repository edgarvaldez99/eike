import { randomBytes } from "node:crypto";

/**
 * Código de ticket, puerto exacto de tickets.php::generarCodigoTicket():
 * "EIK-" + 12 hex mayúsculas. Es el valor que viaja en el QR — no cambiar el
 * formato: hay entradas ya impresas circulando (ver plan de migración §1.6).
 */
export function generarCodigoTicket(): string {
  return `EIK-${randomBytes(6).toString("hex").toUpperCase()}`;
}
