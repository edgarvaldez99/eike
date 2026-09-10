import { Pool, types } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as esquema from "./esquema";

// Todas las PK/FK son BIGINT (OID 20). Sin este parser, pg las devuelve como
// string (para no perder precisión en bigints de 64 bits). Ninguna magnitud
// de este sistema se acerca a Number.MAX_SAFE_INTEGER, así que preferimos
// number nativo — igual que hoy con PDO_MySQL (ver plan de migración §1.1/§4.1).
types.setTypeParser(20, (valor) => Number(valor));

declare global {
  var __eikePool: Pool | undefined;
}

// En dev, Next.js recarga módulos en cada cambio; sin este cache global se
// abriría un pool nuevo por reload y se agotarían las conexiones de Postgres.
// DB_POOL_MAX es opcional (default 8, el mismo valor de siempre en prod —
// la VM es una e2-micro con RAM limitada). .env.test lo sube a 20: los
// tests de concurrencia del carrito (Fase 6 del plan de mejoras) abren
// varias transacciones simultáneas de verdad, y con 8 conexiones el pool se
// agota antes de terminar — eso se ve como un timeout que parece un bug de
// concurrencia y no lo es.
const pool =
  globalThis.__eikePool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.DB_POOL_MAX) || 8,
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__eikePool = pool;
}

export const db = drizzle(pool, { schema: esquema });
export { pool };
