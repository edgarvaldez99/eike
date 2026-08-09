import { randomBytes } from "node:crypto";
import QRCode from "qrcode";

/**
 * Código de ticket, puerto exacto de tickets.php::generarCodigoTicket():
 * "EIK-" + 12 hex mayúsculas. Es el valor que viaja en el QR — no cambiar el
 * formato: hay entradas ya impresas circulando (ver plan de migración §1.6).
 */
export function generarCodigoTicket(): string {
  return `EIK-${randomBytes(6).toString("hex").toUpperCase()}`;
}

/**
 * QR como SVG, generado en el servidor — reemplaza a api.qrserver.com (el
 * PHP viejo mandaba el código del ticket a un tercero por una URL de imagen;
 * ver plan de migración §1.6). Vectorial: no se pixela al imprimir. El
 * contenido del QR sigue siendo el código crudo, sin cambios.
 */
export async function generarQrSvg(codigo: string): Promise<string> {
  return QRCode.toString(codigo, { type: "svg", errorCorrectionLevel: "M", margin: 1 });
}
