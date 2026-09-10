import { eq, sql } from "drizzle-orm";
import { db } from "@/db/cliente";
import { asientos, eventos, ordenes, tandas, tickets } from "@/db/esquema";
import { ErrorNegocio } from "@/lib/errores";
import { generarCodigoOrden, generarCodigoTicket } from "@/lib/qr";
import type { UsuarioSesion } from "@/lib/auth/sesion";

// Vive en su propio archivo (no en server/tickets.ts) a propósito: la Fase 8
// necesita emitir cortesías como premio automático (server/referidos.ts,
// dentro de la transacción de aprobar una orden) sin crear un import
// circular tickets.ts <-> referidos.ts.
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

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
 * tickets.php?accion=crear_cortesia — SIN chequeo de autorización: eso lo
 * hace crearCortesia() (para un organizador desde el panel) o
 * otorgarPremiosPendientes() (Fase 8, para un premio automático del
 * sistema). Se llama siempre con la tanda YA bloqueada FOR UPDATE por el
 * caller, para poder compartir esa misma transacción con lo que sea que
 * la rodee (aprobar una orden, otorgar un premio).
 *
 * Fase 8: de paso valida el estado del evento y de la tanda — el
 * crearCortesia de antes NO lo hacía (bug latente real, ver plan de
 * mejoras).
 */
export async function emitirCortesia(
  tx: Tx,
  datos: DatosCrearCortesia & { aprobadoPor: number | null },
): Promise<{ id: number; codigo: string; eventoId: number }> {
  const [tanda] = await tx
    .select()
    .from(tandas)
    .where(eq(tandas.id, datos.tandaId))
    .for("update");
  if (!tanda) throw new ErrorNegocio("Tanda no encontrada.");
  if (tanda.estado === "inactiva") throw new ErrorNegocio("Esa tanda está inactiva.");

  const [evento] = await tx.select().from(eventos).where(eq(eventos.id, tanda.eventoId)).limit(1);
  if (!evento) throw new ErrorNegocio("Evento no encontrado.");
  if (evento.estado === "cancelado" || evento.estado === "finalizado") {
    throw new ErrorNegocio("No se pueden emitir cortesías para un evento cancelado o finalizado.");
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

  // Fase 5: toda emisión de ticket pasa por una orden — orden_id es NOT
  // NULL. Una cortesía nace ya "pagada" (nada que aprobar: no hay
  // comprobante ni espera).
  const [orden] = await tx
    .insert(ordenes)
    .values({
      codigo: generarCodigoOrden(),
      organizadorId: evento.organizadorId,
      nombreComprador: datos.nombreComprador,
      cedula: datos.cedula,
      email: datos.email,
      contacto: datos.contacto,
      subtotal: 0,
      cantidadTickets: 1,
      estado: "pagada",
      aprobadoPor: datos.aprobadoPor,
    })
    .returning({ id: ordenes.id });

  const codigo = generarCodigoTicket();
  const [creado] = await tx
    .insert(tickets)
    .values({
      codigo,
      eventoId: tanda.eventoId,
      tandaId: datos.tandaId,
      asientoId,
      ordenId: orden.id,
      nombreComprador: datos.nombreComprador,
      cedula: datos.cedula,
      email: datos.email,
      contacto: datos.contacto,
      estado: "disponible",
      esCortesia: true,
      // Una cortesía no tiene costo real — 0, igual que el backfill
      // histórico (ver drizzle/0002_precio_ticket_y_trigger_stock.sql).
      precioUnitario: 0,
      aprobadoPor: datos.aprobadoPor,
    })
    .returning({ id: tickets.id });

  // El stock de la tanda (cantidad_vendida, y el toggle activa<->agotada)
  // lo actualiza solo el trigger trg_tickets_stock al ver este INSERT.

  return { id: creado.id, codigo, eventoId: tanda.eventoId };
}

/** Cortesía emitida a mano por un organizador desde el panel — valida
 * ownership del evento y abre su propia transacción. */
export async function crearCortesia(
  usuario: UsuarioSesion,
  datos: DatosCrearCortesia,
): Promise<{ id: number; codigo: string; eventoId: number }> {
  return db.transaction(async (tx) => {
    const [tandaCheck] = await tx
      .select({ eventoId: tandas.eventoId })
      .from(tandas)
      .where(eq(tandas.id, datos.tandaId))
      .limit(1);
    if (!tandaCheck) throw new ErrorNegocio("Tanda no encontrada.");
    const [evento] = await tx.select().from(eventos).where(eq(eventos.id, tandaCheck.eventoId)).limit(1);
    if (!evento) throw new ErrorNegocio("Evento no encontrado.");
    if (usuario.rol !== "superadmin" && evento.organizadorId !== usuario.id) {
      throw new ErrorNegocio("Ese evento no te pertenece.");
    }
    return emitirCortesia(tx, { ...datos, aprobadoPor: usuario.id });
  });
}
