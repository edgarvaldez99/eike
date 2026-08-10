import { beforeEach } from "vitest";
import { isTable, sql } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { db } from "@/db/cliente";
import * as esquema from "@/db/esquema";

const NOMBRES_TABLAS = Object.values(esquema)
  .filter(isTable)
  .map((tabla) => getTableConfig(tabla as Parameters<typeof getTableConfig>[0]).name);

/**
 * Aísla cada test: trunca todas las tablas (con CASCADE, y reinicia las
 * identities para que los IDs sean predecibles entre tests) antes de que
 * corra. Los tests corren secuenciales (fileParallelism: false en
 * vitest.config.ts) así que esto no compite entre archivos.
 */
beforeEach(async () => {
  if (NOMBRES_TABLAS.length === 0) return;
  await db.execute(sql.raw(`TRUNCATE TABLE ${NOMBRES_TABLAS.map((n) => `"${n}"`).join(", ")} RESTART IDENTITY CASCADE`));
});
