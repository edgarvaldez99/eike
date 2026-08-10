import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/cliente";
import { asientos, eventos, tandas, tickets } from "@/db/esquema";
import { ErrorNegocio } from "@/lib/errores";
import type { UsuarioSesion } from "@/lib/auth/sesion";
import { generarCodigoTicket } from "@/lib/qr";
import { escribirComprobante, type ComprobantePreparado } from "@/lib/archivos/comprobante";

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

// ============================================================================
// Compra pública (Fase 5) — puerto de tickets.php?accion=comprar
// ============================================================================

const MINUTOS_RESERVA = 30; // igual que config.php: reserva_minutos

export interface DatosComprar {
  eventoId: number;
  tandaId: number;
  nombreComprador: string;
  cedula: string | null;
  email: string;
  contacto: string | null;
  /** Solo se respeta si hay comprador logueado (ver tickets.php: invitado = auto-asignado). */
  asientoId: number | null;
  comprobanteTexto: string | null;
  /** Ya validado en memoria (ver lib/archivos/comprobante.ts) antes de llamar acá. */
  comprobante: ComprobantePreparado | null;
}

/**
 * Compra de un ticket, invitado o comprador logueado. Es la transacción más
 * delicada del sistema — puerto 1:1 de tickets.php?accion=comprar, con dos
 * mejoras deliberadas (ver plan de migración §3(a) y §1.6/§7.4):
 *  - `FOR UPDATE SKIP LOCKED` al asignar un asiento automático (sin pedir uno
 *    específico): compradores simultáneos ya no hacen fila por el mismo
 *    asiento libre más bajo, cada uno toma uno distinto sin esperar.
 *  - El comprobante se escribe a disco DESPUÉS del COMMIT, nunca antes: si
 *    la compra falla y hace ROLLBACK, jamás queda un archivo huérfano sin
 *    ticket asociado (el PHP viejo sí tenía ese riesgo).
 */
export async function comprarTicket(
  compradorId: number | null,
  datos: DatosComprar,
): Promise<typeof tickets.$inferSelect> {
  const creado = await db.transaction(async (tx) => {
    const [evento] = await tx
      .select()
      .from(eventos)
      .where(and(eq(eventos.id, datos.eventoId), eq(eventos.estado, "publicado")))
      .limit(1);
    if (!evento) {
      throw new ErrorNegocio("Ese evento no está disponible para la venta.");
    }

    const [tanda] = await tx
      .select()
      .from(tandas)
      .where(and(eq(tandas.id, datos.tandaId), eq(tandas.eventoId, datos.eventoId), eq(tandas.estado, "activa")))
      .for("update");
    if (!tanda) {
      throw new ErrorNegocio("Esa tanda no está disponible.");
    }
    if (tanda.cantidadVendida >= tanda.cantidadTotal) {
      throw new ErrorNegocio("Esa tanda está agotada.");
    }

    const esGratis = tanda.precio === 0;
    let asientoId: number | null = null;

    if (tanda.tipo === "numerada") {
      let asiento: typeof asientos.$inferSelect | undefined;
      if (compradorId !== null && datos.asientoId !== null) {
        [asiento] = await tx
          .select()
          .from(asientos)
          .where(
            and(
              eq(asientos.id, datos.asientoId),
              eq(asientos.tandaId, datos.tandaId),
              eq(asientos.estado, "disponible"),
            ),
          )
          .for("update");
      } else {
        [asiento] = await tx
          .select()
          .from(asientos)
          .where(and(eq(asientos.tandaId, datos.tandaId), eq(asientos.estado, "disponible")))
          .orderBy(asientos.id)
          .limit(1)
          .for("update", { skipLocked: true });
      }
      if (!asiento) {
        throw new ErrorNegocio("Ese asiento ya no está disponible.");
      }
      asientoId = asiento.id;
      await tx
        .update(asientos)
        .set({ estado: esGratis ? "vendido" : "reservado" })
        .where(eq(asientos.id, asientoId));
    }

    if (!esGratis && !datos.comprobante) {
      throw new ErrorNegocio("Hace falta subir el comprobante de pago.");
    }

    const codigo = generarCodigoTicket();
    const estadoTicket = esGratis ? "disponible" : "pendiente";
    const reservadoHasta = esGratis ? null : new Date(Date.now() + MINUTOS_RESERVA * 60 * 1000);
    const comprobanteArchivo =
      !esGratis && datos.comprobante ? `${codigo}.${datos.comprobante.extension}` : null;

    const [fila] = await tx
      .insert(tickets)
      .values({
        codigo,
        eventoId: datos.eventoId,
        tandaId: datos.tandaId,
        asientoId,
        compradorId,
        nombreComprador: datos.nombreComprador,
        cedula: datos.cedula,
        email: datos.email,
        contacto: datos.contacto,
        comprobante: datos.comprobanteTexto,
        comprobanteArchivo,
        estado: estadoTicket,
        reservadoHasta,
      })
      .returning();

    await tx
      .update(tandas)
      .set({ cantidadVendida: sql`${tandas.cantidadVendida} + 1` })
      .where(eq(tandas.id, datos.tandaId));

    return fila;
  });

  if (datos.comprobante && creado.comprobanteArchivo) {
    await escribirComprobante(datos.comprobante, creado.codigo);
  }

  return creado;
}

export interface MiTicket {
  id: number;
  codigo: string;
  estado: string;
  nombreComprador: string;
  cedula: string | null;
  fechaCompra: Date;
  reservadoHasta: Date | null;
  eventoId: number;
  eventoNombre: string;
  fechaEvento: Date;
  lugar: string | null;
  aficheUrl: string | null;
  organizadorNombre: string;
  tandaNombre: string;
  precio: number;
  asientoIdentificador: string | null;
}

/** Puerto de tickets.php?accion=mis_tickets. */
export async function obtenerMisTickets(compradorId: number): Promise<MiTicket[]> {
  const { rows } = await db.execute<{
    id: number;
    codigo: string;
    estado: string;
    nombre_comprador: string;
    cedula: string | null;
    fecha_compra: string;
    reservado_hasta: string | null;
    evento_id: number;
    evento_nombre: string;
    fecha_evento: string;
    lugar: string | null;
    afiche_url: string | null;
    organizador_nombre: string;
    tanda_nombre: string;
    precio: number;
    asiento_identificador: string | null;
  }>(sql`
    SELECT tk.id, tk.codigo, tk.estado, tk.nombre_comprador, tk.cedula, tk.fecha_compra, tk.reservado_hasta,
           e.id AS evento_id, e.nombre AS evento_nombre, e.fecha_evento, e.lugar, e.afiche_url,
           u.nombre AS organizador_nombre,
           td.nombre AS tanda_nombre, td.precio, a.identificador AS asiento_identificador
      FROM tickets tk
      JOIN eventos e ON e.id = tk.evento_id
      JOIN usuarios u ON u.id = e.organizador_id
      JOIN tandas td ON td.id = tk.tanda_id
      LEFT JOIN asientos a ON a.id = tk.asiento_id
     WHERE tk.comprador_id = ${compradorId}
     ORDER BY tk.fecha_compra DESC
  `);
  return rows.map((f) => ({
    id: f.id,
    codigo: f.codigo,
    estado: f.estado,
    nombreComprador: f.nombre_comprador,
    cedula: f.cedula,
    fechaCompra: new Date(f.fecha_compra),
    reservadoHasta: f.reservado_hasta ? new Date(f.reservado_hasta) : null,
    eventoId: f.evento_id,
    eventoNombre: f.evento_nombre,
    fechaEvento: new Date(f.fecha_evento),
    lugar: f.lugar,
    aficheUrl: f.afiche_url,
    organizadorNombre: f.organizador_nombre,
    tandaNombre: f.tanda_nombre,
    precio: Number(f.precio),
    asientoIdentificador: f.asiento_identificador,
  }));
}

export interface TicketParaMostrar extends MiTicket {
  compradorId: number | null;
}

/**
 * Ticket por código, para /entradas/[codigo]. El código es en sí mismo la
 * credencial (48 bits de entropía, igual criterio que el sistema PHP: nunca
 * hubo un endpoint separado "ver por código" con control de acceso — el
 * ticket se mostraba directo tras la compra). La página se marca `noindex`.
 */
export async function obtenerTicketPorCodigo(codigo: string): Promise<TicketParaMostrar | null> {
  const { rows } = await db.execute<{
    id: number;
    codigo: string;
    estado: string;
    nombre_comprador: string;
    cedula: string | null;
    comprador_id: number | null;
    fecha_compra: string;
    reservado_hasta: string | null;
    evento_id: number;
    evento_nombre: string;
    fecha_evento: string;
    lugar: string | null;
    afiche_url: string | null;
    organizador_nombre: string;
    tanda_nombre: string;
    precio: number;
    asiento_identificador: string | null;
  }>(sql`
    SELECT tk.id, tk.codigo, tk.estado, tk.nombre_comprador, tk.cedula, tk.comprador_id,
           tk.fecha_compra, tk.reservado_hasta,
           e.id AS evento_id, e.nombre AS evento_nombre, e.fecha_evento, e.lugar, e.afiche_url,
           u.nombre AS organizador_nombre,
           td.nombre AS tanda_nombre, td.precio, a.identificador AS asiento_identificador
      FROM tickets tk
      JOIN eventos e ON e.id = tk.evento_id
      JOIN usuarios u ON u.id = e.organizador_id
      JOIN tandas td ON td.id = tk.tanda_id
      LEFT JOIN asientos a ON a.id = tk.asiento_id
     WHERE tk.codigo = ${codigo}
     LIMIT 1
  `);
  const f = rows[0];
  if (!f) return null;
  return {
    id: f.id,
    codigo: f.codigo,
    estado: f.estado,
    nombreComprador: f.nombre_comprador,
    cedula: f.cedula,
    compradorId: f.comprador_id,
    fechaCompra: new Date(f.fecha_compra),
    reservadoHasta: f.reservado_hasta ? new Date(f.reservado_hasta) : null,
    eventoId: f.evento_id,
    eventoNombre: f.evento_nombre,
    fechaEvento: new Date(f.fecha_evento),
    lugar: f.lugar,
    aficheUrl: f.afiche_url,
    organizadorNombre: f.organizador_nombre,
    tandaNombre: f.tanda_nombre,
    precio: Number(f.precio),
    asientoIdentificador: f.asiento_identificador,
  };
}

// ============================================================================
// Superadmin (Fase 6) — puerto de tickets.php
// ============================================================================

export interface RankingComprador {
  compradorId: number;
  nombre: string;
  email: string;
  ticketsComprados: number;
  totalGastado: number;
}

/** Puerto de tickets.php?accion=ranking_compradores. */
export async function obtenerRankingCompradores(): Promise<RankingComprador[]> {
  const { rows } = await db.execute<{
    comprador_id: number;
    nombre: string;
    email: string;
    tickets_comprados: number;
    total_gastado: number;
  }>(sql`
    SELECT u.id AS comprador_id, u.nombre, u.email,
           COUNT(*) AS tickets_comprados,
           COALESCE(SUM(td.precio), 0) AS total_gastado
      FROM tickets tk
      JOIN tandas td ON td.id = tk.tanda_id
      JOIN usuarios u ON u.id = tk.comprador_id
     WHERE tk.estado IN ('disponible', 'usado')
     GROUP BY u.id
     ORDER BY total_gastado DESC, tickets_comprados DESC
     LIMIT 20
  `);
  return rows.map((f) => ({
    compradorId: f.comprador_id,
    nombre: f.nombre,
    email: f.email,
    ticketsComprados: Number(f.tickets_comprados),
    totalGastado: Number(f.total_gastado),
  }));
}

export interface ColaPendiente {
  organizadorId: number;
  organizadorNombre: string;
  cantidadPendientes: number;
  horasPromedioEspera: number;
  horasMaxEspera: number;
}

/** Puerto de tickets.php?accion=cola_pendientes. */
export async function obtenerColaPendientes(): Promise<ColaPendiente[]> {
  const { rows } = await db.execute<{
    organizador_id: number;
    organizador_nombre: string;
    cantidad_pendientes: number;
    horas_promedio_espera: number;
    horas_max_espera: number;
  }>(sql`
    SELECT u.id AS organizador_id, u.nombre AS organizador_nombre,
           COUNT(*) AS cantidad_pendientes,
           ROUND(AVG(EXTRACT(EPOCH FROM (now() - tk.fecha_compra)) / 3600)::numeric, 1) AS horas_promedio_espera,
           ROUND((MAX(EXTRACT(EPOCH FROM (now() - tk.fecha_compra))) / 3600)::numeric, 1) AS horas_max_espera
      FROM tickets tk
      JOIN eventos e ON e.id = tk.evento_id
      JOIN usuarios u ON u.id = e.organizador_id
     WHERE tk.estado = 'pendiente'
     GROUP BY u.id
     ORDER BY horas_max_espera DESC
  `);
  return rows.map((f) => ({
    organizadorId: f.organizador_id,
    organizadorNombre: f.organizador_nombre,
    cantidadPendientes: Number(f.cantidad_pendientes),
    horasPromedioEspera: Number(f.horas_promedio_espera),
    horasMaxEspera: Number(f.horas_max_espera),
  }));
}

export interface FiltroHistorialGlobal {
  eventoId?: number;
  organizadorId?: number;
  estado?: string;
  busqueda?: string;
}

export interface TicketHistorialGlobal {
  id: number;
  codigo: string;
  nombreComprador: string;
  cedula: string | null;
  email: string;
  eventoNombre: string;
  organizadorNombre: string;
  tandaNombre: string;
  precio: number;
  estado: string;
  fechaCompra: Date;
}

/** Puerto de tickets.php?accion=detalle_tickets sin evento_id (vista global del superadmin). */
export async function obtenerHistorialGlobal(filtro: FiltroHistorialGlobal): Promise<TicketHistorialGlobal[]> {
  const busqueda = filtro.busqueda ? `%${filtro.busqueda}%` : null;
  const { rows } = await db.execute<{
    id: number;
    codigo: string;
    nombre_comprador: string;
    cedula: string | null;
    email: string;
    evento_nombre: string;
    organizador_nombre: string;
    tanda_nombre: string;
    precio: number;
    estado: string;
    fecha_compra: string;
  }>(sql`
    SELECT tk.id, tk.codigo, tk.nombre_comprador, tk.cedula, tk.email,
           e.nombre AS evento_nombre, u.nombre AS organizador_nombre,
           td.nombre AS tanda_nombre, td.precio, tk.estado, tk.fecha_compra
      FROM tickets tk
      JOIN eventos e ON e.id = tk.evento_id
      JOIN usuarios u ON u.id = e.organizador_id
      JOIN tandas td ON td.id = tk.tanda_id
     WHERE 1 = 1
       ${filtro.eventoId ? sql`AND tk.evento_id = ${filtro.eventoId}` : sql``}
       ${filtro.organizadorId ? sql`AND e.organizador_id = ${filtro.organizadorId}` : sql``}
       ${filtro.estado ? sql`AND tk.estado = ${filtro.estado}` : sql``}
       ${busqueda ? sql`AND (tk.nombre_comprador ILIKE ${busqueda} OR tk.cedula ILIKE ${busqueda} OR tk.email ILIKE ${busqueda})` : sql``}
     ORDER BY tk.fecha_compra DESC
     LIMIT 500
  `);
  return rows.map((f) => ({
    id: f.id,
    codigo: f.codigo,
    nombreComprador: f.nombre_comprador,
    cedula: f.cedula,
    email: f.email,
    eventoNombre: f.evento_nombre,
    organizadorNombre: f.organizador_nombre,
    tandaNombre: f.tanda_nombre,
    precio: Number(f.precio),
    estado: f.estado,
    fechaCompra: new Date(f.fecha_compra),
  }));
}
