import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/cliente";
import { usuarios } from "@/db/esquema";
import { ErrorNegocio } from "@/lib/errores";
import { hashearPassword } from "@/lib/auth/password";
import type { EstadoUsuario } from "@/lib/constantes";

export interface DatosRegistroComprador {
  nombre: string;
  email: string;
  password: string;
  telefono: string | null;
  cedula: string | null;
}

/** Puerto de usuarios.php?accion=registro_comprador — alta directa, sin aprobación. */
export async function registrarComprador(datos: DatosRegistroComprador): Promise<number> {
  const [existente] = await db
    .select({ id: usuarios.id })
    .from(usuarios)
    .where(sql`lower(${usuarios.email}) = lower(${datos.email})`)
    .limit(1);
  if (existente) {
    throw new ErrorNegocio("Ya existe una cuenta con ese email.");
  }

  const passwordHash = await hashearPassword(datos.password);
  const [creado] = await db
    .insert(usuarios)
    .values({
      nombre: datos.nombre,
      email: datos.email,
      passwordHash,
      rol: "comprador",
      telefono: datos.telefono,
      cedula: datos.cedula,
      estado: "activo",
      tycAceptadoEn: new Date(),
    })
    .returning({ id: usuarios.id });
  return creado.id;
}

// ============================================================================
// Gestión de organizadores (superadmin) — puerto de usuarios.php
// ============================================================================

/** Puerto de usuarios.php?accion=listar_organizadores. */
export async function listarOrganizadores(estadoFiltro?: EstadoUsuario) {
  return db
    .select()
    .from(usuarios)
    .where(
      estadoFiltro
        ? and(eq(usuarios.rol, "organizador"), eq(usuarios.estado, estadoFiltro))
        : eq(usuarios.rol, "organizador"),
    )
    .orderBy(sql`${usuarios.creadoEn} desc`);
}

async function organizadorPorId(id: number) {
  const [organizador] = await db
    .select()
    .from(usuarios)
    .where(and(eq(usuarios.id, id), eq(usuarios.rol, "organizador")))
    .limit(1);
  if (!organizador) throw new ErrorNegocio("Organizador no encontrado.");
  return organizador;
}

export async function aprobarOrganizador(id: number) {
  const organizador = await organizadorPorId(id);
  if (organizador.estado !== "pendiente_aprobacion" && organizador.estado !== "rechazado") {
    throw new ErrorNegocio("Solo se puede aprobar un organizador pendiente o rechazado.");
  }
  await db.update(usuarios).set({ estado: "activo", motivoRechazo: null }).where(eq(usuarios.id, id));
}

export async function rechazarOrganizador(id: number, motivo: string) {
  const organizador = await organizadorPorId(id);
  if (organizador.estado !== "pendiente_aprobacion") {
    throw new ErrorNegocio("Solo se puede rechazar un organizador pendiente de aprobación.");
  }
  await db.update(usuarios).set({ estado: "rechazado", motivoRechazo: motivo }).where(eq(usuarios.id, id));
  // TODO (etapa de notificaciones, ver docs/07 #6): avisar por email — sin cambios
  // respecto al PHP, que tampoco lo hacía (no hay envío de email en el sistema).
}

export interface DatosEditarOrganizador {
  nombre?: string;
  telefono?: string | null;
  rucFacturacion?: string | null;
  cedula?: string | null;
}

export async function editarOrganizador(id: number, datos: DatosEditarOrganizador) {
  await organizadorPorId(id);
  await db.update(usuarios).set(datos).where(eq(usuarios.id, id));
}

export async function inactivarOrganizador(id: number) {
  await organizadorPorId(id);
  await db.update(usuarios).set({ estado: "inactivo" }).where(eq(usuarios.id, id));
}

export async function reactivarOrganizador(id: number) {
  const organizador = await organizadorPorId(id);
  if (organizador.estado !== "inactivo") {
    throw new ErrorNegocio("Solo se puede reactivar un organizador inactivo.");
  }
  await db.update(usuarios).set({ estado: "activo" }).where(eq(usuarios.id, id));
}

export interface MetricasGlobales {
  organizadoresPorEstado: Record<string, number>;
  eventosPorEstado: Record<string, number>;
  ticketsVendidosTotal: number;
  ingresosTotales: number;
  compradoresRegistrados: number;
  ticketPromedio: number;
}

/** Puerto de eventos.php?accion=metricas. */
export async function obtenerMetricasGlobales(): Promise<MetricasGlobales> {
  const { rows: filasOrg } = await db.execute<{ estado: string; total: number }>(
    sql`SELECT estado, count(*) AS total FROM usuarios WHERE rol = 'organizador' GROUP BY estado`,
  );
  const { rows: filasEve } = await db.execute<{ estado: string; total: number }>(
    sql`SELECT estado, count(*) AS total FROM eventos GROUP BY estado`,
  );
  const { rows: filaVentas } = await db.execute<{ tickets_vendidos: number; ingresos_totales: number }>(sql`
    SELECT count(*) AS tickets_vendidos, COALESCE(SUM(td.precio), 0) AS ingresos_totales
      FROM tickets t
      JOIN tandas td ON td.id = t.tanda_id
     WHERE t.estado IN ('disponible', 'usado')
  `);
  const [{ n: compradoresRegistrados }] = await db
    .select({ n: sql<number>`count(*)` })
    .from(usuarios)
    .where(eq(usuarios.rol, "comprador"));

  const ticketsVendidosTotal = Number(filaVentas[0]?.tickets_vendidos ?? 0);
  const ingresosTotales = Number(filaVentas[0]?.ingresos_totales ?? 0);

  return {
    organizadoresPorEstado: Object.fromEntries(filasOrg.map((f) => [f.estado, Number(f.total)])),
    eventosPorEstado: Object.fromEntries(filasEve.map((f) => [f.estado, Number(f.total)])),
    ticketsVendidosTotal,
    ingresosTotales,
    compradoresRegistrados: Number(compradoresRegistrados),
    ticketPromedio: ticketsVendidosTotal > 0 ? Math.round(ingresosTotales / ticketsVendidosTotal) : 0,
  };
}
