import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Valida la firma X-Hub-Signature-256 que Meta agrega a cada POST del webhook
 * (HMAC-SHA256 del cuerpo CRUDO con el App Secret). Sin esto cualquiera que
 * conozca la URL podría inyectar "comprobantes" falsos.
 */
export function firmaValida(cuerpoCrudo: string, cabecera: string | null, appSecret: string): boolean {
  if (!cabecera) return false;
  const esperada = `sha256=${createHmac("sha256", appSecret).update(cuerpoCrudo).digest("hex")}`;
  const a = Buffer.from(esperada);
  const b = Buffer.from(cabecera);
  return a.length === b.length && timingSafeEqual(a, b);
}
