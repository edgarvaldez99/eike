/**
 * Mantenimiento único: hay 3 eventos de prueba viejos (creados a mano en
 * sesiones de prueba de otros flujos — aprobación, superadmin, gratuito —
 * no vienen de ningún script de seed) que hoy ensucian la grilla pública
 * mezclados con los del mockup de marca. Se les mueve `fechaEvento` al
 * pasado para que `obtenerEventosPublicos` (que exige no vencidos) deje de
 * mostrarlos, sin tocar su `estado` ni ninguna otra columna — así siguen
 * disponibles intactos para seguir usándolos en pruebas manuales del panel.
 * Idempotente — se puede correr muchas veces sin efecto adicional.
 * Uso: pnpm archivar:eventos-prueba
 */
import { eq } from "drizzle-orm";
import { db, pool } from "@/db/cliente";
import { eventos } from "@/db/esquema";

const NOMBRES = ["Evento Prueba Aprobacion", "Evento del Superadmin", "Evento Gratis Test"];
const FECHA_PASADA = new Date("2020-01-01T12:00:00Z");

async function principal() {
  for (const nombre of NOMBRES) {
    const evento = await db.query.eventos.findFirst({ where: eq(eventos.nombre, nombre) });
    if (!evento) {
      console.log(`  - Evento "${nombre}" no existe en esta base, se salta.`);
      continue;
    }
    await db.update(eventos).set({ fechaEvento: FECHA_PASADA }).where(eq(eventos.id, evento.id));
    console.log(`  + Evento "${nombre}" (id ${evento.id}) archivado — fechaEvento movida al pasado.`);
  }
}

principal()
  .then(() => {
    console.log("Archivado de eventos de prueba viejos completo.");
  })
  .catch((error) => {
    console.error("Falló:", error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
