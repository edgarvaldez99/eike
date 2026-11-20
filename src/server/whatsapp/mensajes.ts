import { and, desc, eq, gt, isNotNull } from "drizzle-orm";
import { db } from "@/db/cliente";
import { mensajesWhatsapp } from "@/db/esquema";
import type { EstadoMensajeWa, TipoMensajeWa } from "@/lib/constantes";

/** Meta permite responder en texto libre hasta 24 h después del último mensaje del cliente. */
export const HORAS_VENTANA = 24;
const MS_VENTANA = HORAS_VENTANA * 60 * 60 * 1000;

const MAX_CONTENIDO = 2000;

export interface EntradaMensaje {
  waMessageId: string | null;
  numero: string;
  ordenId: number | null;
  tipo: TipoMensajeWa;
  contenido: string | null;
  estado: EstadoMensajeWa;
  error?: string | null;
}

/** Guarda un mensaje en la bitácora. Devuelve false si ya estaba (mismo wa_message_id). */
export async function registrarMensaje(m: EntradaMensaje & { direccion: "entrante" | "saliente" }): Promise<boolean> {
  const filas = await db
    .insert(mensajesWhatsapp)
    .values({
      direccion: m.direccion,
      waMessageId: m.waMessageId,
      numero: m.numero,
      ordenId: m.ordenId,
      tipo: m.tipo,
      contenido: m.contenido?.slice(0, MAX_CONTENIDO) ?? null,
      estado: m.estado,
      error: m.error?.slice(0, 255) ?? null,
    })
    .onConflictDoNothing()
    .returning({ id: mensajesWhatsapp.id });
  return filas.length > 0;
}

/** ¿Podemos escribirle en texto libre? Sí si el cliente nos escribió en las últimas 24 h. */
export async function ventanaAbierta(numero: string, ahora = new Date()): Promise<boolean> {
  const [fila] = await db
    .select({ id: mensajesWhatsapp.id })
    .from(mensajesWhatsapp)
    .where(
      and(
        eq(mensajesWhatsapp.numero, numero),
        eq(mensajesWhatsapp.direccion, "entrante"),
        gt(mensajesWhatsapp.creadoEn, new Date(ahora.getTime() - MS_VENTANA)),
      ),
    )
    .limit(1);
  return Boolean(fila);
}

/**
 * Orden con la que el cliente se identificó (mandó su código y el número
 * coincidía con el de la compra) en las últimas 24 h. Sirve para atribuir el
 * comprobante que manda después sin adivinar por monto.
 */
export async function ordenDeLaConversacion(numero: string, ahora = new Date()): Promise<number | null> {
  const [fila] = await db
    .select({ ordenId: mensajesWhatsapp.ordenId })
    .from(mensajesWhatsapp)
    .where(
      and(
        eq(mensajesWhatsapp.numero, numero),
        eq(mensajesWhatsapp.direccion, "entrante"),
        isNotNull(mensajesWhatsapp.ordenId),
        gt(mensajesWhatsapp.creadoEn, new Date(ahora.getTime() - MS_VENTANA)),
      ),
    )
    .orderBy(desc(mensajesWhatsapp.creadoEn))
    .limit(1);
  return fila?.ordenId ?? null;
}

/** Cuántos mensajes le mandamos a ese número desde `desde` (tope anti-bucle y anti-abuso). */
export async function contarSalientesDesde(numero: string, desde: Date): Promise<number> {
  const filas = await db
    .select({ id: mensajesWhatsapp.id })
    .from(mensajesWhatsapp)
    .where(
      and(
        eq(mensajesWhatsapp.numero, numero),
        eq(mensajesWhatsapp.direccion, "saliente"),
        gt(mensajesWhatsapp.creadoEn, desde),
      ),
    );
  return filas.length;
}

// 'leido' > 'entregado' > 'enviado': Meta puede mandar los estados desordenados
// y uno viejo no debe pisar a uno más avanzado. 'fallido' siempre se aplica.
const RANGO: Partial<Record<EstadoMensajeWa, number>> = { simulado: 0, enviado: 1, entregado: 2, leido: 3 };

/** Aplica un estado de entrega informado por Meta al mensaje saliente. */
export async function actualizarEstadoSaliente(
  waMessageId: string,
  estado: Extract<EstadoMensajeWa, "enviado" | "entregado" | "leido" | "fallido">,
  error: string | null = null,
): Promise<void> {
  const [actual] = await db
    .select({ estado: mensajesWhatsapp.estado })
    .from(mensajesWhatsapp)
    .where(and(eq(mensajesWhatsapp.waMessageId, waMessageId), eq(mensajesWhatsapp.direccion, "saliente")))
    .limit(1);
  if (!actual) return;
  if (estado !== "fallido" && (RANGO[estado] ?? 0) <= (RANGO[actual.estado] ?? 0)) return;
  await db
    .update(mensajesWhatsapp)
    .set({ estado, error: error?.slice(0, 255) ?? null, actualizadoEn: new Date() })
    .where(eq(mensajesWhatsapp.waMessageId, waMessageId));
}
