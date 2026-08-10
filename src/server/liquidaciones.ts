import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/cliente";
import { liquidaciones, usuarios } from "@/db/esquema";
import { ErrorNegocio } from "@/lib/errores";

interface ResumenOrganizador {
  ingresosConfirmados: number;
  retirado: number;
  pendiente: number;
}

/**
 * "Retirado" = neto (total_vendido - comisión) de liquidaciones marcadas
 * `liquidado`. "Pendiente" = ventas confirmadas que todavía no entraron en
 * ninguna liquidación pagada. Puerto de liquidaciones.php::resumenOrganizador
 * — organizadorId null agrega TODOS los organizadores (vista superadmin).
 */
export async function resumenOrganizador(organizadorId: number | null): Promise<ResumenOrganizador> {
  const { rows: filaVentas } = await db.execute<{ ingresos: number }>(sql`
    SELECT COALESCE(SUM(td.precio), 0) AS ingresos
      FROM tickets tk
      JOIN tandas td ON td.id = tk.tanda_id
      JOIN eventos e ON e.id = tk.evento_id
     WHERE tk.estado IN ('disponible', 'usado')
       ${organizadorId !== null ? sql`AND e.organizador_id = ${organizadorId}` : sql``}
  `);
  const ingresosConfirmados = Number(filaVentas[0]?.ingresos ?? 0);

  const { rows: filaLiq } = await db.execute<{ bruto: number; neto: number }>(sql`
    SELECT COALESCE(SUM(total_vendido), 0) AS bruto,
           COALESCE(SUM(total_vendido - monto_comision_o_suscripcion), 0) AS neto
      FROM liquidaciones
     WHERE estado = 'liquidado'
       ${organizadorId !== null ? sql`AND organizador_id = ${organizadorId}` : sql``}
  `);
  const retiradoBruto = Number(filaLiq[0]?.bruto ?? 0);
  const retirado = Number(filaLiq[0]?.neto ?? 0);

  return {
    ingresosConfirmados,
    retirado,
    pendiente: Math.max(0, ingresosConfirmados - retiradoBruto),
  };
}

export interface ResumenOrganizadorConDatos extends ResumenOrganizador {
  organizadorId: number;
  nombre: string;
  email: string;
}

/** Puerto de liquidaciones.php?accion=resumen_organizadores. */
export async function resumenTodosLosOrganizadores(): Promise<ResumenOrganizadorConDatos[]> {
  const filas = await db
    .select({ id: usuarios.id, nombre: usuarios.nombre, email: usuarios.email })
    .from(usuarios)
    .where(eq(usuarios.rol, "organizador"))
    .orderBy(usuarios.nombre);

  const resumenes = await Promise.all(
    filas.map(async (f) => ({
      organizadorId: f.id,
      nombre: f.nombre,
      email: f.email,
      ...(await resumenOrganizador(f.id)),
    })),
  );
  return resumenes;
}

export interface DatosCrearLiquidacion {
  organizadorId: number;
  periodoInicio: string;
  periodoFin: string;
  totalVendido: number;
  montoComisionOSuscripcion: number;
}

/** Puerto de liquidaciones.php?accion=crear — se registra ya "liquidado" (el pago se hace presencial, por fuera). */
export async function crearLiquidacion(datos: DatosCrearLiquidacion): Promise<number> {
  const [organizador] = await db
    .select({ id: usuarios.id })
    .from(usuarios)
    .where(and(eq(usuarios.id, datos.organizadorId), eq(usuarios.rol, "organizador")))
    .limit(1);
  if (!organizador) throw new ErrorNegocio("Organizador no encontrado.");

  const [creada] = await db
    .insert(liquidaciones)
    .values({
      organizadorId: datos.organizadorId,
      periodoInicio: datos.periodoInicio,
      periodoFin: datos.periodoFin,
      totalVendido: datos.totalVendido,
      montoComisionOSuscripcion: datos.montoComisionOSuscripcion,
      estado: "liquidado",
      liquidadoEn: new Date(),
    })
    .returning({ id: liquidaciones.id });
  return creada.id;
}
