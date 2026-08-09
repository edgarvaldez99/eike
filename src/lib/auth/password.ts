import bcrypt from "bcryptjs";

/**
 * Costo de los hashes NUEVOS generados por esta app. El PHP actual usa
 * PASSWORD_DEFAULT (bcrypt, costo 10); acá usamos 12 para los que se creen
 * de ahora en más. Los hashes migrados desde MariaDB se validan igual
 * (bcryptjs no obliga a un costo fijo) — ver plan de migración §1.2/§7.4
 * sobre la reescritura de prefijo $2y$ → $2b$ en la migración de datos.
 */
const COSTO_HASH = 12;

export async function hashearPassword(password: string): Promise<string> {
  return bcrypt.hash(password, COSTO_HASH);
}

export async function verificarPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
