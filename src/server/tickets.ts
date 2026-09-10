import { and, eq, lte, sql } from "drizzle-orm";
import { db } from "@/db/cliente";
import { asientos, cuponUsos, eventos, ordenes, tandas, tickets } from "@/db/esquema";
import { ErrorNegocio } from "@/lib/errores";
import type { UsuarioSesion } from "@/lib/auth/sesion";
import { generarCodigoOrden, generarCodigoTicket } from "@/lib/qr";
import { escribirComprobante, type ComprobantePreparado } from "@/lib/archivos/comprobante";
import { consumirCupon } from "@/server/cupones";
import {
  esVentaReferidaValida,
  otorgarPremiosPendientes,
  registrarVentaReferida,
  resolverReferidor,
  sincronizarVentaReferidaYPremios,
} from "@/server/referidos";

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
        SUM(CASE WHEN tk.estado IN ('disponible', 'usado') AND NOT tk.es_cortesia THEN tk.precio_pagado ELSE 0 END) AS ingresos
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
    SELECT COUNT(*) AS tickets, COALESCE(SUM(tk.precio_pagado), 0) AS ingresos
      FROM tickets tk
     WHERE tk.evento_id = ${evento.id} AND tk.estado IN ('disponible', 'usado') AND NOT tk.es_cortesia
       AND (tk.fecha_compra AT TIME ZONE 'America/Asuncion')::date = (now() AT TIME ZONE 'America/Asuncion')::date
  `);
  const hoy = { tickets: Number(filaHoy[0]?.tickets ?? 0), ingresos: Number(filaHoy[0]?.ingresos ?? 0) };

  // fecha_compra marca el día de la venta; actualizado_en (trigger) marca el
  // día en que un ticket pasó a 'anulado' — columnas distintas a propósito
  // para no mezclar "cuándo se vendió" con "cuándo se canceló".
  const { rows: filasVentas } = await db.execute<{ fecha: string; tickets: number; ingresos: number }>(sql`
    SELECT (tk.fecha_compra AT TIME ZONE 'America/Asuncion')::date AS fecha,
           COUNT(*) AS tickets, COALESCE(SUM(tk.precio_pagado), 0) AS ingresos
      FROM tickets tk
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

export interface OrdenPendiente {
  id: number;
  codigo: string;
  nombreComprador: string;
  cedula: string | null;
  email: string;
  fechaCompra: Date;
  reservadoHasta: Date | null;
  eventoNombre: string;
  // Hoy una orden tiene siempre 1 ticket (1:1), así que alcanza con mostrar
  // la tanda de ese único ticket. Cuando el carrito (Fase 6) permita
  // mezclar tandas en una orden, esto necesita agregarse ("N tandas") en vez
  // de asumir una sola — dejar la advertencia si se toca esta función.
  tandaNombre: string;
  cantidadTickets: number;
  total: number;
}

/** Puerto de tickets.php?accion=listar_pendientes, adaptado a la Fase 5: la
 * cola de aprobación lista ÓRDENES, no tickets sueltos — un organizador
 * aprueba/rechaza la compra entera. El evento (si se pasa) ya se validó. */
export async function obtenerPendientes(
  usuario: UsuarioSesion,
  eventoId?: number,
): Promise<OrdenPendiente[]> {
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
    cantidad_tickets: number;
    total: number;
  }>(sql`
    SELECT o.id, o.codigo, o.nombre_comprador, o.cedula, o.email, o.creado_en AS fecha_compra,
           o.reservado_hasta, o.cantidad_tickets, o.total,
           e.nombre AS evento_nombre, td.nombre AS tanda_nombre
      FROM ordenes o
      JOIN tickets tk ON tk.orden_id = o.id
      JOIN eventos e ON e.id = tk.evento_id
      JOIN tandas td ON td.id = tk.tanda_id
     WHERE o.estado = 'pendiente'
       ${eventoId ? sql`AND tk.evento_id = ${eventoId}` : usuario.rol === "superadmin" ? sql`` : sql`AND o.organizador_id = ${usuario.id}`}
     ORDER BY o.creado_en
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
    cantidadTickets: Number(f.cantidad_tickets),
    total: Number(f.total),
  }));
}

/** Puerto de tickets.php::ticketPendientePropio, adaptado a órdenes (Fase 5). */
export async function obtenerOrdenPendientePropia(id: number, usuario: UsuarioSesion) {
  const [orden] = await db.select().from(ordenes).where(eq(ordenes.id, id)).limit(1);
  if (!orden) throw new ErrorNegocio("Orden no encontrada.");
  if (usuario.rol !== "superadmin" && orden.organizadorId !== usuario.id) {
    throw new ErrorNegocio("Esa orden no te pertenece.");
  }
  if (orden.estado !== "pendiente") {
    throw new ErrorNegocio("Solo se pueden aprobar/rechazar órdenes pendientes.");
  }
  return orden;
}

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Aprueba TODOS los tickets de la orden en una sola transacción (hoy es
 * siempre 1, ver comentario de OrdenPendiente). De paso arregla un bug
 * latente: antes (aprobarTicket) el asiento de una compra numerada paga
 * quedaba en 'reservado' para siempre — nunca pasaba a 'vendido'.
 * Devuelve los eventoId tocados, para que el caller revalide sus páginas.
 */
export async function aprobarOrden(orden: typeof ordenes.$inferSelect, usuario: UsuarioSesion): Promise<number[]> {
  return db.transaction(async (tx) => {
    const ticketsDeLaOrden = await tx.select().from(tickets).where(eq(tickets.ordenId, orden.id));
    for (const ticket of ticketsDeLaOrden) {
      await tx
        .update(tickets)
        .set({ estado: "disponible", aprobadoPor: usuario.id })
        .where(eq(tickets.id, ticket.id));
      if (ticket.asientoId !== null) {
        await tx.update(asientos).set({ estado: "vendido" }).where(eq(asientos.id, ticket.asientoId));
      }
    }
    await tx
      .update(ordenes)
      .set({ estado: "pagada", aprobadoPor: usuario.id })
      .where(eq(ordenes.id, orden.id));
    // Fase 8: si esta orden tenía una venta referida pendiente, ahora
    // cuenta como válida — y de paso se intenta otorgar el premio que
    // corresponda (no-op si no hay ninguno pendiente).
    await sincronizarVentaReferidaYPremios(tx, orden.id, "valida");
    return [...new Set(ticketsDeLaOrden.map((t) => t.eventoId))];
  });
}

/** Anula el ticket y devuelve su asiento (si tenía). El stock de la tanda
 * (cantidad_vendida, y el toggle activa<->agotada) ya NO se toca acá: lo
 * mantiene solo el trigger trg_tickets_stock en cuanto ve este UPDATE de
 * estado a 'anulado' (ver drizzle/0002_precio_ticket_y_trigger_stock.sql,
 * Fase 4). */
async function anularYLiberarStock(tx: Tx, ticket: typeof tickets.$inferSelect) {
  await tx.update(tickets).set({ estado: "anulado" }).where(eq(tickets.id, ticket.id));
  if (ticket.asientoId !== null) {
    await tx.update(asientos).set({ estado: "disponible" }).where(eq(asientos.id, ticket.asientoId));
  }
}

/** Rechaza la orden entera: anula todos sus tickets y libera su stock/asientos.
 * Devuelve los eventoId tocados, para que el caller revalide sus páginas. */
export async function rechazarOrden(orden: typeof ordenes.$inferSelect): Promise<number[]> {
  return db.transaction(async (tx) => {
    const ticketsDeLaOrden = await tx.select().from(tickets).where(eq(tickets.ordenId, orden.id));
    for (const ticket of ticketsDeLaOrden) {
      await anularYLiberarStock(tx, ticket);
    }
    await tx.update(ordenes).set({ estado: "rechazada" }).where(eq(ordenes.id, orden.id));
    // Fase 8: si tenía una venta referida, se anula con la orden.
    await sincronizarVentaReferidaYPremios(tx, orden.id, "anulada");
    return [...new Set(ticketsDeLaOrden.map((t) => t.eventoId))];
  });
}

/**
 * Barrido de reservas vencidas (Fase 3 del plan de mejoras — bug real de
 * producción, no una feature nueva; adaptado a órdenes en la Fase 5).
 * `ordenes.reservado_hasta` y sus dos índices existían desde el día uno de
 * la Fase 3, pero ningún código los consultaba jamás: una orden "pendiente"
 * nunca aprobada retenía su cupo para siempre.
 *
 * Cada candidato se re-verifica ("¿sigue pendiente Y sigue vencido?") bajo
 * `FOR UPDATE` dentro de su propia transacción, para no pisar una
 * aprobación/rechazo manual que el organizador hizo un instante antes.
 * Una transacción por orden, nunca todas juntas: así una orden con datos
 * raros no bloquea el barrido de las demás.
 */
export async function barrerReservasVencidas(limite = 200): Promise<number> {
  const candidatos = await db
    .select({ id: ordenes.id })
    .from(ordenes)
    .where(and(eq(ordenes.estado, "pendiente"), lte(ordenes.reservadoHasta, new Date())))
    .orderBy(ordenes.id)
    .limit(limite);

  let liberadas = 0;
  for (const { id } of candidatos) {
    const seLiberoEsta = await db.transaction(async (tx) => {
      const [orden] = await tx
        .select()
        .from(ordenes)
        .where(and(eq(ordenes.id, id), eq(ordenes.estado, "pendiente"), lte(ordenes.reservadoHasta, sql`now()`)))
        .for("update");
      if (!orden) return false; // alguien la aprobó/rechazó justo ahora

      const ticketsDeLaOrden = await tx.select().from(tickets).where(eq(tickets.ordenId, orden.id));
      for (const ticket of ticketsDeLaOrden) {
        await anularYLiberarStock(tx, ticket);
      }
      await tx.update(ordenes).set({ estado: "vencida" }).where(eq(ordenes.id, orden.id));
      // Fase 8: si tenía una venta referida, se anula con la orden.
      await sincronizarVentaReferidaYPremios(tx, orden.id, "anulada");
      return true;
    });
    if (seLiberoEsta) liberadas++;
  }
  return liberadas;
}

// emitirCortesia/crearCortesia viven en su propio archivo (server/cortesias.ts)
// desde la Fase 8, no acá: server/referidos.ts necesita emitirCortesia para
// otorgar premios, y si viviera en este archivo se armaría un import
// circular tickets.ts <-> referidos.ts. Re-exportado para no tener que
// tocar a quien ya lo importaba de acá (src/lib/acciones/tickets.ts).
export { crearCortesia, emitirCortesia, type DatosCrearCortesia } from "./cortesias";

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
  precioPagado: number;
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
    precio_pagado: number;
    asiento_identificador: string | null;
  }>(sql`
    SELECT tk.id, tk.codigo, tk.nombre_comprador, tk.cedula, tk.email, tk.contacto,
           tk.estado, tk.fecha_compra, tk.hora_ingreso,
           td.nombre AS tanda_nombre, tk.precio_pagado, a.identificador AS asiento_identificador
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
    precioPagado: Number(f.precio_pagado),
    asientoIdentificador: f.asiento_identificador,
  }));
}

// ============================================================================
// Compra pública (Fase 5) — puerto de tickets.php?accion=comprar
// ============================================================================

// Antes 30 minutos (igual que config.php: reserva_minutos). Se subió a 48
// horas en la Fase 3 del plan de mejoras: a los 30 minutos originales nunca
// se llegó a barrer nada (ver barrerReservasVencidas más abajo — no existía
// ningún barrido, así que un pendiente nunca aprobado retenía el cupo para
// siempre). Auto-anular en 30 minutos una compra que YA tiene comprobante
// subido es además peligroso: ese comprador pagó de verdad, y quien lo
// verifica es el organizador a mano.
// Exportada: server/carrito.ts (Fase 6) la reutiliza para la orden que
// genera el checkout del carrito — misma ventana, una sola fuente de verdad.
export const HORAS_RESERVA = 48;

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
  /** Fase 7 del plan de mejoras — cupón de descuento (opcional). Se
   * re-valida y consume DENTRO de esta transacción — nunca confiar en un
   * descuento calculado antes (ver previsualizarCupon, que es de solo
   * lectura y puede quedar desactualizado entre la vista y el submit). */
  codigoCupon: string | null;
  /** Fase 8 del plan de mejoras — código de referido, de la cookie
   * `eike_ref` (ver proxy.ts). Se resuelve y valida (anti-fraude)
   * DENTRO de esta transacción — si no es válido, la compra sigue igual,
   * simplemente sin atribuir la venta a nadie. */
  codigoReferido: string | null;
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

    // Fase 7: el cupón se consume ACÁ, ya con la tanda bloqueada y antes de
    // decidir esGratis — un cupón del 100% tiene que dejar la tanda como
    // gratis para todo lo que sigue (asiento 'vendido' en vez de
    // 'reservado', sin exigir comprobante).
    let cuponId: number | null = null;
    let descuento = 0;
    if (datos.codigoCupon) {
      const consumido = await consumirCupon(tx, {
        codigo: datos.codigoCupon,
        organizadorId: evento.organizadorId,
        eventoId: evento.id,
        subtotal: tanda.precio,
        email: datos.email,
      });
      cuponId = consumido.cuponId;
      descuento = consumido.descuento;
    }

    const esGratis = tanda.precio - descuento <= 0;

    // Fase 8: igual que el cupón, el referido se resuelve y valida ACÁ, ya
    // con todo lo necesario para el anti-fraude (organizadorId, email,
    // cédula, compradorId). Un código inválido o un auto-referido NUNCA
    // rompe la compra — la venta simplemente queda sin atribuir a nadie.
    let referidorId: number | null = null;
    if (datos.codigoReferido) {
      const referidor = await resolverReferidor(datos.codigoReferido);
      if (
        referidor &&
        esVentaReferidaValida({
          referidor,
          organizadorId: evento.organizadorId,
          compradorId,
          email: datos.email,
          cedula: datos.cedula,
        })
      ) {
        referidorId = referidor.id;
      }
    }

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

    const codigoOrden = generarCodigoOrden();
    const estadoTicket = esGratis ? "disponible" : "pendiente";
    const estadoOrden = esGratis ? "pagada" : "pendiente";
    const reservadoHasta = esGratis ? null : new Date(Date.now() + HORAS_RESERVA * 60 * 60 * 1000);
    // El comprobante vive en la ORDEN, no en el ticket (Fase 5): con el
    // carrito (Fase 6), N tickets de una misma orden van a compartir el
    // mismo comprobante — nombrarlo ya por el código de la orden evita
    // renombrar archivos después.
    const comprobanteArchivo =
      !esGratis && datos.comprobante ? `${codigoOrden}.${datos.comprobante.extension}` : null;

    const [orden] = await tx
      .insert(ordenes)
      .values({
        codigo: codigoOrden,
        organizadorId: evento.organizadorId,
        compradorId,
        nombreComprador: datos.nombreComprador,
        cedula: datos.cedula,
        email: datos.email,
        contacto: datos.contacto,
        comprobante: datos.comprobanteTexto,
        comprobanteArchivo,
        subtotal: tanda.precio,
        descuento,
        cuponId,
        codigoCupon: cuponId !== null ? datos.codigoCupon : null,
        referidoPorUsuarioId: referidorId,
        codigoReferido: referidorId !== null ? datos.codigoReferido : null,
        cantidadTickets: 1,
        estado: estadoOrden,
        reservadoHasta,
      })
      .returning();

    const [fila] = await tx
      .insert(tickets)
      .values({
        codigo: generarCodigoTicket(),
        eventoId: datos.eventoId,
        tandaId: datos.tandaId,
        asientoId,
        ordenId: orden.id,
        compradorId,
        nombreComprador: datos.nombreComprador,
        cedula: datos.cedula,
        email: datos.email,
        contacto: datos.contacto,
        estado: estadoTicket,
        // Snapshot del precio (Fase 4): de acá en más el ticket no depende
        // de tandas.precio para saber cuánto costó — ver esquema.ts.
        precioUnitario: tanda.precio,
        descuento,
        reservadoHasta,
      })
      .returning();

    // Como una compra sigue siendo 1 ticket (sin carrito todavía, Fase 6),
    // el descuento de la orden y el del ticket son siempre el mismo número
    // — no hace falta "repartir" nada entre varios tickets.
    if (cuponId !== null) {
      await tx.insert(cuponUsos).values({
        cuponId,
        ordenId: orden.id,
        compradorId,
        email: datos.email,
        montoDescontado: descuento,
      });
    }

    // Fase 8: la venta referida nace 'valida' si la orden ya nació resuelta
    // (gratis, o cupón del 100%) — no hay aprobación manual que la vaya a
    // sincronizar después, así que el otorgamiento de premios se intenta
    // ACÁ mismo, en la misma transacción.
    if (referidorId !== null) {
      await registrarVentaReferida(tx, {
        referidorId,
        ordenId: orden.id,
        organizadorId: evento.organizadorId,
        eventoId: evento.id,
        cantidadTickets: 1,
        monto: tanda.precio - descuento,
        estadoInicial: estadoOrden === "pagada" ? "valida" : "pendiente",
      });
      if (estadoOrden === "pagada") {
        await otorgarPremiosPendientes(tx, referidorId, evento.organizadorId, evento.id);
      }
    }

    // El stock de la tanda (cantidad_vendida, y el toggle activa<->agotada
    // de la Fase 2) lo actualiza solo el trigger trg_tickets_stock al ver
    // este INSERT — ver drizzle/0002_precio_ticket_y_trigger_stock.sql.

    return { ticket: fila, orden };
  });

  if (datos.comprobante && creado.orden.comprobanteArchivo) {
    await escribirComprobante(datos.comprobante, creado.orden.codigo);
  }

  return creado.ticket;
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
  precioPagado: number;
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
    precio_pagado: number;
    asiento_identificador: string | null;
  }>(sql`
    SELECT tk.id, tk.codigo, tk.estado, tk.nombre_comprador, tk.cedula, tk.fecha_compra, tk.reservado_hasta,
           e.id AS evento_id, e.nombre AS evento_nombre, e.fecha_evento, e.lugar, e.afiche_url,
           u.nombre AS organizador_nombre,
           td.nombre AS tanda_nombre, tk.precio_pagado, a.identificador AS asiento_identificador
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
    precioPagado: Number(f.precio_pagado),
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
    precio_pagado: number;
    asiento_identificador: string | null;
  }>(sql`
    SELECT tk.id, tk.codigo, tk.estado, tk.nombre_comprador, tk.cedula, tk.comprador_id,
           tk.fecha_compra, tk.reservado_hasta,
           e.id AS evento_id, e.nombre AS evento_nombre, e.fecha_evento, e.lugar, e.afiche_url,
           u.nombre AS organizador_nombre,
           td.nombre AS tanda_nombre, tk.precio_pagado, a.identificador AS asiento_identificador
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
    precioPagado: Number(f.precio_pagado),
    asientoIdentificador: f.asiento_identificador,
  };
}

export interface TicketDeOrden {
  codigo: string;
  tandaNombre: string;
  asientoIdentificador: string | null;
}

export interface OrdenParaMostrar {
  codigo: string;
  eventoNombre: string;
  fechaEvento: Date;
  lugar: string | null;
  tickets: TicketDeOrden[];
}

/**
 * Orden por código, para /entradas/orden/[codigo] — el índice que ve el
 * comprador justo después del checkout del carrito (Fase 6): una compra ya
 * puede traer varios tickets (varias tandas/unidades) bajo un solo
 * comprobante, así que hace falta una vista "resumen de la compra" antes de
 * entrar a cada ticket individual (que sigue viviendo en /entradas/[codigo]).
 * Mismo criterio de acceso que un ticket: el código ES la credencial.
 */
export async function obtenerOrdenParaMostrar(codigo: string): Promise<OrdenParaMostrar | null> {
  const [orden] = await db.select().from(ordenes).where(eq(ordenes.codigo, codigo)).limit(1);
  if (!orden) return null;

  const { rows } = await db.execute<{
    codigo: string;
    tanda_nombre: string;
    asiento_identificador: string | null;
    evento_nombre: string;
    fecha_evento: string;
    lugar: string | null;
  }>(sql`
    SELECT tk.codigo, td.nombre AS tanda_nombre, a.identificador AS asiento_identificador,
           e.nombre AS evento_nombre, e.fecha_evento, e.lugar
      FROM tickets tk
      JOIN tandas td ON td.id = tk.tanda_id
      JOIN eventos e ON e.id = tk.evento_id
      LEFT JOIN asientos a ON a.id = tk.asiento_id
     WHERE tk.orden_id = ${orden.id}
     ORDER BY tk.id
  `);
  if (rows.length === 0) return null;

  return {
    codigo: orden.codigo,
    eventoNombre: rows[0].evento_nombre,
    fechaEvento: new Date(rows[0].fecha_evento),
    lugar: rows[0].lugar,
    tickets: rows.map((f) => ({
      codigo: f.codigo,
      tandaNombre: f.tanda_nombre,
      asientoIdentificador: f.asiento_identificador,
    })),
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
           COALESCE(SUM(tk.precio_pagado), 0) AS total_gastado
      FROM tickets tk
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
  precioPagado: number;
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
    precio_pagado: number;
    estado: string;
    fecha_compra: string;
  }>(sql`
    SELECT tk.id, tk.codigo, tk.nombre_comprador, tk.cedula, tk.email,
           e.nombre AS evento_nombre, u.nombre AS organizador_nombre,
           td.nombre AS tanda_nombre, tk.precio_pagado, tk.estado, tk.fecha_compra
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
    precioPagado: Number(f.precio_pagado),
    estado: f.estado,
    fechaCompra: new Date(f.fecha_compra),
  }));
}
