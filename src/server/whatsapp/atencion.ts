import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/cliente";
import { comprobantesWhatsapp, derivacionesWhatsapp, ordenes } from "@/db/esquema";
import { ErrorNegocio } from "@/lib/errores";
import { enviarTexto } from "./enviar";

/**
 * Cola de atención manual de WhatsApp: conversaciones que el bot pasó a una
 * persona y comprobantes recibidos que todavía no se atan a ninguna compra.
 */

/** Abre una derivación para el número (a lo sumo una abierta por número). Devuelve false si ya había una. */
export async function derivarAPersona(args: {
  numero: string;
  motivo: string;
  ultimoMensaje: string | null;
  ordenId: number | null;
}): Promise<boolean> {
  const filas = await db
    .insert(derivacionesWhatsapp)
    .values({
      numero: args.numero,
      motivo: args.motivo.slice(0, 255),
      ultimoMensaje: args.ultimoMensaje?.slice(0, 1000) ?? null,
      ordenId: args.ordenId,
    })
    .onConflictDoNothing()
    .returning({ id: derivacionesWhatsapp.id });
  return filas.length > 0;
}

export async function listarDerivacionesAbiertas() {
  return db
    .select({
      id: derivacionesWhatsapp.id,
      numero: derivacionesWhatsapp.numero,
      motivo: derivacionesWhatsapp.motivo,
      ultimoMensaje: derivacionesWhatsapp.ultimoMensaje,
      creadoEn: derivacionesWhatsapp.creadoEn,
      ordenCodigo: ordenes.codigo,
    })
    .from(derivacionesWhatsapp)
    .leftJoin(ordenes, eq(ordenes.id, derivacionesWhatsapp.ordenId))
    .where(eq(derivacionesWhatsapp.estado, "abierta"))
    .orderBy(derivacionesWhatsapp.creadoEn);
}

export async function contarDerivacionesAbiertas(): Promise<number> {
  return (await db.select({ id: derivacionesWhatsapp.id }).from(derivacionesWhatsapp).where(eq(derivacionesWhatsapp.estado, "abierta"))).length;
}

export async function resolverDerivacion(id: number): Promise<void> {
  const filas = await db
    .update(derivacionesWhatsapp)
    .set({ estado: "resuelta", resueltoEn: new Date() })
    .where(and(eq(derivacionesWhatsapp.id, id), eq(derivacionesWhatsapp.estado, "abierta")))
    .returning({ id: derivacionesWhatsapp.id });
  if (filas.length === 0) throw new ErrorNegocio("Esa derivación ya no está abierta.");
}

/** Comprobantes recibidos por WhatsApp que no se pudieron atar a una compra (los más recientes primero). */
export async function listarComprobantesSinOrden() {
  return db
    .select({
      id: comprobantesWhatsapp.id,
      waFrom: comprobantesWhatsapp.waFrom,
      nombrePerfil: comprobantesWhatsapp.nombrePerfil,
      caption: comprobantesWhatsapp.caption,
      banco: comprobantesWhatsapp.banco,
      monto: comprobantesWhatsapp.monto,
      estado: comprobantesWhatsapp.estado,
      problemas: comprobantesWhatsapp.problemas,
      recibidoEn: comprobantesWhatsapp.recibidoEn,
    })
    .from(comprobantesWhatsapp)
    .where(and(eq(comprobantesWhatsapp.origen, "whatsapp"), isNull(comprobantesWhatsapp.ordenId)))
    .orderBy(desc(comprobantesWhatsapp.recibidoEn))
    .limit(50);
}

/**
 * Ata a mano un comprobante a una compra pendiente (por su código). No cambia
 * el estado del comprobante ni aprueba nada: la compra se aprueba después, en
 * Compras, con el comprobante a la vista.
 */
export async function asignarComprobanteAOrden(comprobanteId: number, codigo: string): Promise<void> {
  const [orden] = await db
    .select({ id: ordenes.id, estado: ordenes.estado })
    .from(ordenes)
    .where(eq(ordenes.codigo, codigo.trim().toUpperCase()))
    .limit(1);
  if (!orden) throw new ErrorNegocio("No existe una compra con ese código.");
  if (orden.estado !== "pendiente") throw new ErrorNegocio("Esa compra ya no está pendiente.");
  const filas = await db
    .update(comprobantesWhatsapp)
    .set({ ordenId: orden.id })
    .where(and(eq(comprobantesWhatsapp.id, comprobanteId), isNull(comprobantesWhatsapp.ordenId)))
    .returning({ id: comprobantesWhatsapp.id });
  if (filas.length === 0) throw new ErrorNegocio("Ese comprobante ya está asignado o no existe.");
}

/** Le escribe al cliente de una derivación abierta (texto libre: solo dentro de las 24 h de su último mensaje). */
export async function responderDerivacion(id: number, texto: string): Promise<void> {
  const [derivacion] = await db
    .select({ numero: derivacionesWhatsapp.numero, ordenId: derivacionesWhatsapp.ordenId })
    .from(derivacionesWhatsapp)
    .where(and(eq(derivacionesWhatsapp.id, id), eq(derivacionesWhatsapp.estado, "abierta")))
    .limit(1);
  if (!derivacion) throw new ErrorNegocio("Esa derivación ya no está abierta.");
  const resultado = await enviarTexto(derivacion.numero, texto, { ordenId: derivacion.ordenId });
  if (resultado.estado === "sin_ventana") {
    throw new ErrorNegocio("Pasaron más de 24 h desde el último mensaje del cliente: por WhatsApp ya no se le puede escribir. Contactalo por correo.");
  }
  if (resultado.estado === "fallido") throw new ErrorNegocio(`WhatsApp no pudo enviar el mensaje: ${resultado.error}`);
}
