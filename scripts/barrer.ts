/**
 * Corre a mano el barrido de reservas vencidas (Fase 3) + carritos vencidos
 * (Fase 6) del plan de mejoras. En producción esto lo dispara el
 * contenedor cron cada 60s pegándole al endpoint HTTP (ver
 * docker/compose.prod.yml + src/app/api/mantenimiento/barrer/route.ts);
 * este script es para correrlo manualmente contra cualquier base (local, o
 * la de producción por túnel) sin pasar por HTTP.
 *
 * Uso: pnpm barrer
 */
import { pool } from "@/db/cliente";
import { barrerReservasVencidas } from "@/server/tickets";
import { barrerCarritosVencidos } from "@/server/carrito";

Promise.all([barrerReservasVencidas(), barrerCarritosVencidos()])
  .then(([liberados, carritosBarridos]) => {
    console.log(`Reservas vencidas liberadas: ${liberados}`);
    console.log(`Carritos vencidos barridos: ${carritosBarridos}`);
  })
  .catch((error) => {
    console.error("Falló el barrido de reservas/carritos vencidos:", error.message ?? error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
