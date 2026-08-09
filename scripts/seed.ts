/**
 * Datos semilla mínimos, idempotente (se puede correr muchas veces sin
 * duplicar). Equivalente al INSERT final de sql/schema.sql.
 * Uso: pnpm seed
 */
import { eq } from "drizzle-orm";
import { db, pool } from "@/db/cliente";
import { planesSuscripcion } from "@/db/esquema";

const PLANES = [
  { nombre: "Starter", ticketsIncluidosMes: 500, precioMensual: 870_000 },
  { nombre: "Growth", ticketsIncluidosMes: 2_500, precioMensual: 1_065_000 },
  { nombre: "Pro", ticketsIncluidosMes: 8_000, precioMensual: 1_600_000 },
] as const;

async function principal() {
  for (const plan of PLANES) {
    const existente = await db.query.planesSuscripcion.findFirst({
      where: eq(planesSuscripcion.nombre, plan.nombre),
    });
    if (existente) {
      console.log(`  = Plan "${plan.nombre}" ya existe (id ${existente.id}), no se toca.`);
      continue;
    }
    const [creado] = await db
      .insert(planesSuscripcion)
      .values({
        nombre: plan.nombre,
        ticketsIncluidosMes: plan.ticketsIncluidosMes,
        precioMensual: plan.precioMensual,
      })
      .returning({ id: planesSuscripcion.id });
    console.log(`  + Plan "${plan.nombre}" creado (id ${creado.id}).`);
  }
}

principal()
  .then(() => {
    console.log("Seed completo.");
  })
  .catch((error) => {
    console.error("Seed falló:", error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
