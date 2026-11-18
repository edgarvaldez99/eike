import { eq } from "drizzle-orm";
import { db } from "@/db/cliente";
import { ordenes, tickets } from "@/db/esquema";

/**
 * Comprobante que subió el comprador, buscado por el CÓDIGO de su compra
 * (ORD-… de una orden del carrito, EIK-… de un ticket suelto). Sirve para que
 * el comprador, sin sesión, lo comparta por WhatsApp desde la pantalla de su
 * compra — el código ya es la credencial de esa pantalla (ver
 * /entradas/orden/[codigo]).
 *
 * Solo se entrega mientras la orden está PENDIENTE: es evidencia de pago con
 * datos bancarios, y una vez aprobada o rechazada ya no hay motivo para
 * seguir exponiéndola por un link.
 */
async function ordenDeLaCompra(codigo: string) {
  if (codigo.startsWith("ORD-")) {
    const [orden] = await db.select().from(ordenes).where(eq(ordenes.codigo, codigo)).limit(1);
    return orden ?? null;
  }
  const [fila] = await db
    .select({ orden: ordenes })
    .from(tickets)
    .innerJoin(ordenes, eq(ordenes.id, tickets.ordenId))
    .where(eq(tickets.codigo, codigo))
    .limit(1);
  return fila?.orden ?? null;
}

/** Nombre del archivo del comprobante (solo el basename), o null si no hay o la compra ya no está pendiente. */
export async function buscarComprobantePendiente(codigo: string): Promise<string | null> {
  const orden = await ordenDeLaCompra(codigo);
  if (!orden || orden.estado !== "pendiente") return null;
  if (orden.comprobanteArchivo) return orden.comprobanteArchivo;

  // Legacy (backfill de la Fase 5): la orden no tiene archivo propio, se quedó en su ticket.
  const [ticketLegacy] = await db
    .select({ comprobanteArchivo: tickets.comprobanteArchivo })
    .from(tickets)
    .where(eq(tickets.ordenId, orden.id))
    .limit(1);
  return ticketLegacy?.comprobanteArchivo ?? null;
}
