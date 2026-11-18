/**
 * Corre a mano la lectura del buzón de pagos y la conciliación de avisos del
 * banco con las órdenes pendientes (ver src/server/conciliacion/). En
 * producción lo mismo se dispara por HTTP (api/mantenimiento/conciliar).
 *
 * Uso: pnpm conciliar
 */
import { pool } from "@/db/cliente";
import { leerCorreoBanco } from "@/server/conciliacion/correo";

leerCorreoBanco()
  .then((resumen) => console.table(resumen))
  .catch((error) => {
    console.error("Falló la lectura del buzón de pagos:", error.message ?? error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
