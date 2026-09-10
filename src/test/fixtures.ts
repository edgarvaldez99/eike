import { eq } from "drizzle-orm";
import { db } from "@/db/cliente";
import { asientos, carritoItems, carritos, cupones, eventos, ordenes, tandas, tickets, usuarios } from "@/db/esquema";
import { hashearPassword } from "@/lib/auth/password";
import type {
  EstadoAsiento,
  EstadoCarrito,
  EstadoEvento,
  EstadoOrden,
  EstadoTanda,
  EstadoTicket,
  EstadoUsuario,
  Rol,
  TipoCupon,
  TipoTanda,
} from "@/lib/constantes";

/**
 * Factories mínimas para armar precondiciones en los tests de integración
 * de src/server/** — insertan directo por Drizzle (no pasan por Server
 * Actions ni por la lógica bajo test) para no acoplar un test a otra pieza
 * de lógica de negocio.
 */

export async function crearUsuario(datos: {
  rol: Rol;
  estado?: EstadoUsuario;
  nombre?: string;
  email?: string;
  password?: string;
}) {
  const [fila] = await db
    .insert(usuarios)
    .values({
      nombre: datos.nombre ?? "Usuario de test",
      email: datos.email ?? `test-${Math.random().toString(36).slice(2)}@test.com`,
      passwordHash: await hashearPassword(datos.password ?? "test1234"),
      rol: datos.rol,
      estado: datos.estado ?? "activo",
    })
    .returning({ id: usuarios.id });
  return fila.id;
}

export async function crearEvento(datos: {
  organizadorId: number;
  estado?: EstadoEvento;
  nombre?: string;
  fechaEvento?: Date;
  esGratuito?: boolean;
}) {
  const [fila] = await db
    .insert(eventos)
    .values({
      organizadorId: datos.organizadorId,
      nombre: datos.nombre ?? "Evento de test",
      fechaEvento: datos.fechaEvento ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      estado: datos.estado ?? "publicado",
      esGratuito: datos.esGratuito ?? false,
    })
    .returning({ id: eventos.id });
  return fila.id;
}

export async function crearTanda(datos: {
  eventoId: number;
  nombre?: string;
  tipo?: TipoTanda;
  precio?: number;
  cantidadTotal?: number;
  cantidadVendida?: number;
  estado?: EstadoTanda;
}) {
  const [fila] = await db
    .insert(tandas)
    .values({
      eventoId: datos.eventoId,
      nombre: datos.nombre ?? "General",
      tipo: datos.tipo ?? "general",
      precio: datos.precio ?? 50000,
      cantidadTotal: datos.cantidadTotal ?? 10,
      cantidadVendida: datos.cantidadVendida ?? 0,
      estado: datos.estado ?? "activa",
    })
    .returning({ id: tandas.id });
  return fila.id;
}

export async function crearAsiento(datos: {
  tandaId: number;
  identificador?: string;
  estado?: EstadoAsiento;
}) {
  const [fila] = await db
    .insert(asientos)
    .values({
      tandaId: datos.tandaId,
      identificador: datos.identificador ?? `A-${Math.floor(Math.random() * 100000)}`,
      estado: datos.estado ?? "disponible",
    })
    .returning({ id: asientos.id });
  return fila.id;
}

/** Orden mínima (Fase 5 del plan de mejoras) — normalmente NO hace falta
 * llamarla a mano: crearTicket() crea una automática si no se le pasa
 * `ordenId`. Usarla directo solo cuando un test necesita controlar la orden
 * en sí (su estado, su reservado_hasta, varios tickets bajo la misma orden). */
export async function crearOrden(datos: {
  organizadorId: number;
  compradorId?: number | null;
  estado?: EstadoOrden;
  codigo?: string;
  nombreComprador?: string;
  email?: string;
  subtotal?: number;
  descuento?: number;
  cantidadTickets?: number;
  reservadoHasta?: Date | null;
}) {
  const [fila] = await db
    .insert(ordenes)
    .values({
      codigo: datos.codigo ?? `ORD-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
      organizadorId: datos.organizadorId,
      compradorId: datos.compradorId ?? null,
      nombreComprador: datos.nombreComprador ?? "Comprador de test",
      email: datos.email ?? "comprador@test.com",
      subtotal: datos.subtotal ?? 0,
      descuento: datos.descuento ?? 0,
      cantidadTickets: datos.cantidadTickets ?? 1,
      estado: datos.estado ?? "pendiente",
      reservadoHasta: datos.reservadoHasta ?? null,
    })
    .returning({ id: ordenes.id });
  return fila.id;
}

/** Mismo mapeo que usa el backfill de la migración 0003_ordenes.sql. */
function estadoOrdenDesdeTicket(estado: EstadoTicket): EstadoOrden {
  if (estado === "pendiente") return "pendiente";
  if (estado === "anulado") return "rechazada";
  return "pagada"; // disponible, usado
}

export async function crearTicket(datos: {
  eventoId: number;
  tandaId: number;
  asientoId?: number | null;
  compradorId?: number | null;
  estado?: EstadoTicket;
  codigo?: string;
  nombreComprador?: string;
  email?: string;
  /** Precio pagado (Fase 4 del plan de mejoras) — default 0, igual que la
   * columna. NO se infiere de la tanda: a propósito, para que un test que
   * espere plata la declare explícita en vez de depender del precio de
   * lista actual de la tanda (que es justo lo que dejó de ser la fuente de
   * verdad). precioPagado (generada) sale solo de precioUnitario/descuento. */
  precioUnitario?: number;
  descuento?: number;
  /** orden_id es NOT NULL (Fase 5) — si no se pasa, se crea una orden mínima
   * automática (mismo organizador que el evento, mismo estado derivado del
   * ticket) para no obligar a todos los tests existentes a conocer órdenes. */
  ordenId?: number;
}) {
  let ordenId = datos.ordenId;
  if (ordenId === undefined) {
    const [evento] = await db
      .select({ organizadorId: eventos.organizadorId })
      .from(eventos)
      .where(eq(eventos.id, datos.eventoId))
      .limit(1);
    ordenId = await crearOrden({
      organizadorId: evento!.organizadorId,
      compradorId: datos.compradorId ?? null,
      estado: estadoOrdenDesdeTicket(datos.estado ?? "disponible"),
      subtotal: datos.precioUnitario ?? 0,
      descuento: datos.descuento ?? 0,
    });
  }

  const [fila] = await db
    .insert(tickets)
    .values({
      eventoId: datos.eventoId,
      tandaId: datos.tandaId,
      asientoId: datos.asientoId ?? null,
      ordenId,
      compradorId: datos.compradorId ?? null,
      estado: datos.estado ?? "disponible",
      codigo: datos.codigo ?? `EIK-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
      nombreComprador: datos.nombreComprador ?? "Comprador de test",
      email: datos.email ?? "comprador@test.com",
      precioUnitario: datos.precioUnitario ?? 0,
      descuento: datos.descuento ?? 0,
    })
    .returning({ id: tickets.id });
  return fila.id;
}

/** Carrito directo (Fase 6 del plan de mejoras) — a diferencia de
 * server/carrito.ts::crearCarrito, deja fijar estado/expiraEn/organizadorId
 * a mano para armar precondiciones (carrito vencido, ya completado, etc.). */
export async function crearCarritoFixture(datos?: {
  token?: string;
  organizadorId?: number | null;
  usuarioId?: number | null;
  estado?: EstadoCarrito;
  expiraEn?: Date | null;
  creadoEn?: Date;
}) {
  const [fila] = await db
    .insert(carritos)
    .values({
      token: datos?.token ?? `tok-${Math.random().toString(36).slice(2, 12)}`,
      organizadorId: datos?.organizadorId ?? null,
      usuarioId: datos?.usuarioId ?? null,
      estado: datos?.estado ?? "activo",
      expiraEn: datos?.expiraEn ?? null,
      ...(datos?.creadoEn ? { creadoEn: datos.creadoEn } : {}),
    })
    .returning();
  return fila;
}

/** `asientoId` arma una fila "pineada" (cantidad forzada a 1, ver
 * esquema.ts) — no marca el asiento como 'reservado' solo: a diferencia de
 * agregarItemCarrito, este fixture inserta directo, así que un test que
 * necesite el asiento en 'reservado' de verdad tiene que fijarlo aparte. */
export async function crearItemCarritoFixture(datos: {
  carritoId: number;
  tandaId: number;
  cantidad?: number;
  asientoId?: number | null;
}) {
  const [fila] = await db
    .insert(carritoItems)
    .values({
      carritoId: datos.carritoId,
      tandaId: datos.tandaId,
      cantidad: datos.asientoId ? 1 : (datos.cantidad ?? 1),
      asientoId: datos.asientoId ?? null,
    })
    .returning({ id: carritoItems.id });
  return fila.id;
}

/** Inserta un cupón directo (Fase 7 del plan de mejoras) — a diferencia de
 * server/cupones.ts::crearCupon (que valida reglas de negocio), esta
 * permite armar estados que esa función no dejaría crear a propósito
 * (usos ya al límite, vencido, inactivo), para testear cómo reacciona
 * consumirCupon/previsualizarCupon ante esos estados. */
export async function crearCuponFixture(datos: {
  organizadorId: number;
  eventoId?: number | null;
  codigo?: string;
  tipo?: TipoCupon;
  valor?: number;
  maxUsos?: number | null;
  usos?: number;
  maxUsosPorComprador?: number | null;
  montoMinimo?: number;
  venceEn?: Date | null;
  activo?: boolean;
}) {
  const [fila] = await db
    .insert(cupones)
    .values({
      organizadorId: datos.organizadorId,
      eventoId: datos.eventoId ?? null,
      codigo: datos.codigo ?? `CUPON${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      tipo: datos.tipo ?? "porcentaje",
      valor: datos.valor ?? 10,
      maxUsos: datos.maxUsos ?? null,
      usos: datos.usos ?? 0,
      maxUsosPorComprador: datos.maxUsosPorComprador === undefined ? 1 : datos.maxUsosPorComprador,
      montoMinimo: datos.montoMinimo ?? 0,
      venceEn: datos.venceEn ?? null,
      activo: datos.activo ?? true,
    })
    .returning({ id: cupones.id });
  return fila.id;
}
