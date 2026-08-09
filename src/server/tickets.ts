import { sql } from "drizzle-orm";
import { db } from "@/db/cliente";
import { asientos, eventos, tandas, tickets } from "@/db/esquema";
import { eq } from "drizzle-orm";
import { ErrorNegocio } from "@/lib/errores";
import type { UsuarioSesion } from "@/lib/auth/sesion";
import { generarCodigoTicket } from "@/lib/qr";

/** "Hoy" calendario en Asunción, como epoch de días (medianoche UTC de ese día). */
function fechaSoloDiaAsuncion(fecha: Date): number {
  const formateador = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Asuncion",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const [y, m, d] = formateador.format(fecha).split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
}

function diasEntre(desde: Date, hasta: Date): number {
  return fechaSoloDiaAsuncion(hasta) - fechaSoloDiaAsuncion(desde);
}

export interface FilaPorTanda {
  id: number;
  nombre: string;
  tipo: string;
  precio: number;
  cantidadTotal: number;
  cantidadVendida: number;
  pendientes: number;
  disponibles: number;
  usados: number;
  anulados: number;
  cortesias: number;
  ingresos: number;
}

export interface DashboardEvento {
  porTanda: FilaPorTanda[];
  totales: {
    pendientes: number;
    disponibles: number;
    usados: number;
    anulados: number;
    cortesias: number;
    ingresos: number;
    ticketsGenerados: number;
  };
  hoy: { tickets: number; ingresos: number };
  tendencia: { fecha: string; ventas: number; tickets: number; cancelaciones: number }[];
  proyeccion: { ingresos: number; tickets: number };
}

/** Puerto de tickets.php?accion=dashboard. El evento ya se validó (eventoPropioODeSuperadmin). */
export async function obtenerDashboard(evento: typeof eventos.$inferSelect): Promise<DashboardEvento> {
  const { rows: filasPorTanda } = await db.execute<{
    id: number;
    nombre: string;
    tipo: string;
    precio: number;
    cantidad_total: number;
    cantidad_vendida: number;
    pendientes: number;
    disponibles: number;
    usados: number;
    anulados: number;
    cortesias: number;
    ingresos: number;
  }>(sql`
    SELECT
        t.id, t.nombre, t.tipo, t.precio, t.cantidad_total, t.cantidad_vendida,
        SUM(CASE WHEN tk.estado = 'pendiente' THEN 1 ELSE 0 END) AS pendientes,
        SUM(CASE WHEN tk.estado = 'disponible' AND NOT tk.es_cortesia THEN 1 ELSE 0 END) AS disponibles,
        SUM(CASE WHEN tk.estado = 'usado' AND NOT tk.es_cortesia THEN 1 ELSE 0 END) AS usados,
        SUM(CASE WHEN tk.estado = 'anulado' THEN 1 ELSE 0 END) AS anulados,
        SUM(CASE WHEN tk.estado IN ('disponible', 'usado') AND tk.es_cortesia THEN 1 ELSE 0 END) AS cortesias,
        SUM(CASE WHEN tk.estado IN ('disponible', 'usado') AND NOT tk.es_cortesia THEN t.precio ELSE 0 END) AS ingresos
      FROM tandas t
      LEFT JOIN tickets tk ON tk.tanda_id = t.id
     WHERE t.evento_id = ${evento.id}
     GROUP BY t.id
     ORDER BY t.id
  `);

  const porTanda: FilaPorTanda[] = filasPorTanda.map((f) => ({
    id: f.id,
    nombre: f.nombre,
    tipo: f.tipo,
    precio: Number(f.precio),
    cantidadTotal: Number(f.cantidad_total),
    cantidadVendida: Number(f.cantidad_vendida),
    pendientes: Number(f.pendientes),
    disponibles: Number(f.disponibles),
    usados: Number(f.usados),
    anulados: Number(f.anulados),
    cortesias: Number(f.cortesias),
    ingresos: Number(f.ingresos),
  }));

  const totales = porTanda.reduce(
    (acc, f) => ({
      pendientes: acc.pendientes + f.pendientes,
      disponibles: acc.disponibles + f.disponibles,
      usados: acc.usados + f.usados,
      anulados: acc.anulados + f.anulados,
      cortesias: acc.cortesias + f.cortesias,
      ingresos: acc.ingresos + f.ingresos,
    }),
    { pendientes: 0, disponibles: 0, usados: 0, anulados: 0, cortesias: 0, ingresos: 0 },
  );
  const ticketsGenerados =
    totales.pendientes + totales.disponibles + totales.usados + totales.anulados + totales.cortesias;

  const { rows: filaHoy } = await db.execute<{ tickets: number; ingresos: number }>(sql`
    SELECT COUNT(*) AS tickets, COALESCE(SUM(td.precio), 0) AS ingresos
      FROM tickets tk
      JOIN tandas td ON td.id = tk.tanda_id
     WHERE tk.evento_id = ${evento.id} AND tk.estado IN ('disponible', 'usado') AND NOT tk.es_cortesia
       AND (tk.fecha_compra AT TIME ZONE 'America/Asuncion')::date = (now() AT TIME ZONE 'America/Asuncion')::date
  `);
  const hoy = { tickets: Number(filaHoy[0]?.tickets ?? 0), ingresos: Number(filaHoy[0]?.ingresos ?? 0) };

  // fecha_compra marca el día de la venta; actualizado_en (trigger) marca el
  // día en que un ticket pasó a 'anulado' — columnas distintas a propósito
  // para no mezclar "cuándo se vendió" con "cuándo se canceló".
  const { rows: filasVentas } = await db.execute<{ fecha: string; tickets: number; ingresos: number }>(sql`
    SELECT (tk.fecha_compra AT TIME ZONE 'America/Asuncion')::date AS fecha,
           COUNT(*) AS tickets, COALESCE(SUM(td.precio), 0) AS ingresos
      FROM tickets tk
      JOIN tandas td ON td.id = tk.tanda_id
     WHERE tk.evento_id = ${evento.id} AND tk.estado IN ('disponible', 'usado') AND NOT tk.es_cortesia
       AND tk.fecha_compra >= (now() AT TIME ZONE 'America/Asuncion')::date - INTERVAL '13 days'
     GROUP BY 1
  `);
  const ventasPorDia = new Map(filasVentas.map((f) => [f.fecha, { tickets: Number(f.tickets), ingresos: Number(f.ingresos) }]));

  const { rows: filasCancel } = await db.execute<{ fecha: string; tickets: number }>(sql`
    SELECT (tk.actualizado_en AT TIME ZONE 'America/Asuncion')::date AS fecha, COUNT(*) AS tickets
      FROM tickets tk
     WHERE tk.evento_id = ${evento.id} AND tk.estado = 'anulado'
       AND tk.actualizado_en >= (now() AT TIME ZONE 'America/Asuncion')::date - INTERVAL '13 days'
     GROUP BY 1
  `);
  const cancelacionesPorDia = new Map(filasCancel.map((f) => [f.fecha, Number(f.tickets)]));

  const tendencia: DashboardEvento["tendencia"] = [];
  const hoyMs = Date.now();
  for (let i = 13; i >= 0; i--) {
    const fecha = new Date(hoyMs - i * 86_400_000);
    const clave = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Asuncion" }).format(fecha);
    tendencia.push({
      fecha: clave,
      ventas: ventasPorDia.get(clave)?.ingresos ?? 0,
      tickets: ventasPorDia.get(clave)?.tickets ?? 0,
      cancelaciones: cancelacionesPorDia.get(clave) ?? 0,
    });
  }

  // Proyección simple: promedio diario de la ventana con datos × días restantes.
  const ahora = new Date();
  const diasTranscurridos = Math.max(1, Math.min(14, diasEntre(evento.creadoEn, ahora) + 1));
  const sumaIngresosVentana = tendencia.reduce((s, t) => s + t.ventas, 0);
  const sumaTicketsVentana = tendencia.reduce((s, t) => s + t.tickets, 0);
  const promedioIngresosDia = sumaIngresosVentana / diasTranscurridos;
  const promedioTicketsDia = sumaTicketsVentana / diasTranscurridos;
  const diasRestantes = Math.max(0, diasEntre(ahora, evento.fechaEvento));

  const proyeccion = {
    ingresos: Math.round(totales.ingresos + promedioIngresosDia * diasRestantes),
    tickets: Math.round(totales.disponibles + totales.usados + promedioTicketsDia * diasRestantes),
  };

  return { porTanda, totales: { ...totales, ticketsGenerados }, hoy, tendencia, proyeccion };
}

export interface TicketPendiente {
  id: number;
  codigo: string;
  nombreComprador: string;
  cedula: string | null;
  email: string;
  fechaCompra: Date;
  reservadoHasta: Date | null;
  eventoNombre: string;
  tandaNombre: string;
  precio: number;
}

/** Puerto de tickets.php?accion=listar_pendientes. El evento (si se pasa) ya se validó. */
export async function obtenerPendientes(
  usuario: UsuarioSesion,
  eventoId?: number,
): Promise<TicketPendiente[]> {
  const { rows } = await db.execute<{
    id: number;
    codigo: string;
    nombre_comprador: string;
    cedula: string | null;
    email: string;
    fecha_compra: string;
    reservado_hasta: string | null;
    evento_nombre: string;
    tanda_nombre: string;
    precio: number;
  }>(sql`
    SELECT tk.id, tk.codigo, tk.nombre_comprador, tk.cedula, tk.email, tk.fecha_compra, tk.reservado_hasta,
           e.nombre AS evento_nombre, td.nombre AS tanda_nombre, td.precio
      FROM tickets tk
      JOIN eventos e ON e.id = tk.evento_id
      JOIN tandas td ON td.id = tk.tanda_id
     WHERE tk.estado = 'pendiente'
       ${eventoId ? sql`AND tk.evento_id = ${eventoId}` : usuario.rol === "superadmin" ? sql`` : sql`AND e.organizador_id = ${usuario.id}`}
     ORDER BY tk.fecha_compra
  `);
  return rows.map((f) => ({
    id: f.id,
    codigo: f.codigo,
    nombreComprador: f.nombre_comprador,
    cedula: f.cedula,
    email: f.email,
    fechaCompra: new Date(f.fecha_compra),
    reservadoHasta: f.reservado_hasta ? new Date(f.reservado_hasta) : null,
    eventoNombre: f.evento_nombre,
    tandaNombre: f.tanda_nombre,
    precio: Number(f.precio),
  }));
}

/** Puerto de tickets.php::ticketPendientePropio + acción aprobar/rechazar. */
export async function obtenerTicketPendientePropio(id: number, usuario: UsuarioSesion) {
  const [fila] = await db
    .select({ ticket: tickets, organizadorId: eventos.organizadorId })
    .from(tickets)
    .innerJoin(eventos, eq(eventos.id, tickets.eventoId))
    .where(eq(tickets.id, id))
    .limit(1);

  if (!fila) throw new ErrorNegocio("Ticket no encontrado.");
  if (usuario.rol !== "superadmin" && fila.organizadorId !== usuario.id) {
    throw new ErrorNegocio("Ese ticket no te pertenece.");
  }
  if (fila.ticket.estado !== "pendiente") {
    throw new ErrorNegocio("Solo se pueden aprobar/rechazar tickets pendientes.");
  }
  return fila.ticket;
}

export async function aprobarTicket(ticket: typeof tickets.$inferSelect, usuario: UsuarioSesion) {
  await db
    .update(tickets)
    .set({ estado: "disponible", aprobadoPor: usuario.id })
    .where(eq(tickets.id, ticket.id));
}

export async function rechazarTicket(ticket: typeof tickets.$inferSelect) {
  await db.transaction(async (tx) => {
    await tx.update(tickets).set({ estado: "anulado" }).where(eq(tickets.id, ticket.id));
    await tx
      .update(tandas)
      .set({ cantidadVendida: sql`${tandas.cantidadVendida} - 1` })
      .where(sql`${tandas.id} = ${ticket.tandaId} AND ${tandas.cantidadVendida} > 0`);
    if (ticket.asientoId !== null) {
      await tx.update(asientos).set({ estado: "disponible" }).where(eq(asientos.id, ticket.asientoId));
    }
  });
}

export interface DatosCrearCortesia {
  tandaId: number;
  nombreComprador: string;
  email: string;
  cedula: string | null;
  contacto: string | null;
}

/**
 * Emite un ticket gratuito dentro de un evento pago, sin pasar por
 * 'pendiente' ni pedir comprobante (docs/15 sección A). Puerto de
 * tickets.php?accion=crear_cortesia.
 */
export async function crearCortesia(
  usuario: UsuarioSesion,
  datos: DatosCrearCortesia,
): Promise<{ id: number; codigo: string; eventoId: number }> {
  return db.transaction(async (tx) => {
    const [tanda] = await tx
      .select()
      .from(tandas)
      .where(eq(tandas.id, datos.tandaId))
      .for("update");
    if (!tanda) throw new ErrorNegocio("Tanda no encontrada.");

    const [evento] = await tx.select().from(eventos).where(eq(eventos.id, tanda.eventoId)).limit(1);
    if (!evento) throw new ErrorNegocio("Evento no encontrado.");
    if (usuario.rol !== "superadmin" && evento.organizadorId !== usuario.id) {
      throw new ErrorNegocio("Ese evento no te pertenece.");
    }

    if (tanda.cantidadVendida >= tanda.cantidadTotal) {
      throw new ErrorNegocio("Esa tanda está agotada, no quedan cupos para emitir cortesías.");
    }

    let asientoId: number | null = null;
    if (tanda.tipo === "numerada") {
      const [asiento] = await tx
        .select()
        .from(asientos)
        .where(sql`${asientos.tandaId} = ${datos.tandaId} AND ${asientos.estado} = 'disponible'`)
        .orderBy(asientos.id)
        .limit(1)
        .for("update", { skipLocked: true });
      if (!asiento) throw new ErrorNegocio("No quedan asientos disponibles en esa tanda.");
      asientoId = asiento.id;
      await tx.update(asientos).set({ estado: "vendido" }).where(eq(asientos.id, asientoId));
    }

    const codigo = generarCodigoTicket();
    const [creado] = await tx
      .insert(tickets)
      .values({
        codigo,
        eventoId: tanda.eventoId,
        tandaId: datos.tandaId,
        asientoId,
        nombreComprador: datos.nombreComprador,
        cedula: datos.cedula,
        email: datos.email,
        contacto: datos.contacto,
        estado: "disponible",
        esCortesia: true,
        aprobadoPor: usuario.id,
      })
      .returning({ id: tickets.id });

    await tx
      .update(tandas)
      .set({ cantidadVendida: sql`${tandas.cantidadVendida} + 1` })
      .where(eq(tandas.id, datos.tandaId));

    return { id: creado.id, codigo, eventoId: tanda.eventoId };
  });
}

export interface FiltroDetalleTickets {
  tandaId?: number;
  estado?: string;
}

export interface TicketDetalle {
  id: number;
  codigo: string;
  nombreComprador: string;
  cedula: string | null;
  email: string;
  contacto: string | null;
  estado: string;
  fechaCompra: Date;
  horaIngreso: Date | null;
  tandaNombre: string;
  precio: number;
  asientoIdentificador: string | null;
}

/** Puerto de tickets.php?accion=detalle_tickets (acotado al evento — la vista global del superadmin es Fase 6). */
export async function obtenerDetalleTickets(
  eventoId: number,
  filtro: FiltroDetalleTickets,
): Promise<TicketDetalle[]> {
  const { rows } = await db.execute<{
    id: number;
    codigo: string;
    nombre_comprador: string;
    cedula: string | null;
    email: string;
    contacto: string | null;
    estado: string;
    fecha_compra: string;
    hora_ingreso: string | null;
    tanda_nombre: string;
    precio: number;
    asiento_identificador: string | null;
  }>(sql`
    SELECT tk.id, tk.codigo, tk.nombre_comprador, tk.cedula, tk.email, tk.contacto,
           tk.estado, tk.fecha_compra, tk.hora_ingreso,
           td.nombre AS tanda_nombre, td.precio, a.identificador AS asiento_identificador
      FROM tickets tk
      JOIN tandas td ON td.id = tk.tanda_id
      LEFT JOIN asientos a ON a.id = tk.asiento_id
     WHERE tk.evento_id = ${eventoId}
       ${filtro.tandaId ? sql`AND tk.tanda_id = ${filtro.tandaId}` : sql``}
       ${filtro.estado ? sql`AND tk.estado = ${filtro.estado}` : sql``}
     ORDER BY tk.fecha_compra DESC
     LIMIT 500
  `);
  return rows.map((f) => ({
    id: f.id,
    codigo: f.codigo,
    nombreComprador: f.nombre_comprador,
    cedula: f.cedula,
    email: f.email,
    contacto: f.contacto,
    estado: f.estado,
    fechaCompra: new Date(f.fecha_compra),
    horaIngreso: f.hora_ingreso ? new Date(f.hora_ingreso) : null,
    tandaNombre: f.tanda_nombre,
    precio: Number(f.precio),
    asientoIdentificador: f.asiento_identificador,
  }));
}
