import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/cliente";
import { comprobantesWhatsapp, ordenes } from "@/db/esquema";
import { formatoFecha, formatoGs } from "@/lib/formato";
import { normalizarTelefonoPy } from "@/lib/telefono";
import { origenSitio, urlCompra } from "@/lib/url-sitio";
import { obtenerAliasBancarioPlataforma } from "@/server/cuenta";
import { derivarAPersona } from "./atencion";
import { enviarTexto } from "./enviar";
import { consultarIA, iaActiva } from "./ia";
import { contarSalientesDesde, historialReciente, mensajeYaRegistrado, registrarMensaje } from "./mensajes";

/** Tope de respuestas automáticas a un mismo número por hora: corta bucles y abuso. */
const MAX_RESPUESTAS_POR_HORA = 5;

const ETIQUETA_ALIAS = { ruc: "RUC", cedula: "cédula", telefono: "teléfono", correo: "correo" } as const;

const MENSAJE_NO_ENCONTRADA =
  "No encontramos una compra con ese código asociada a este número. Revisá que sea el código que figura en tu compra (empieza con ORD-) y que escribas desde el WhatsApp que cargaste al comprar.";
const MENSAJE_AYUDA =
  "Hola, soy el asistente automático de Eike. Escribime el código de tu compra (empieza con ORD-) y te cuento cómo va. Si ya pagaste, mandame la foto del comprobante.";

const MENSAJE_DERIVADO =
  "Listo, avisamos a una persona del equipo. Te escribe por este chat apenas pueda. Si es por un pago, mandanos también la foto del comprobante.";

// "quiero hablar con una persona", "necesito un asesor", "pasame con alguien"…
const PIDE_PERSONA = /\b(asesor|asesora|humano|operador|operadora|agente)\b|\b(hablar|comunicar\w*|pasa\w*|atend\w*)\b.{0,25}\b(persona|alguien|gente)\b/i;

export function pidePersona(texto: string): boolean {
  return PIDE_PERSONA.test(texto);
}

/** Busca el código de una orden del carrito ("ORD-…") dentro de un texto libre; lo devuelve en mayúsculas. */
export function extraerCodigoOrden(texto: string): string | null {
  const m = texto.match(/\bORD-[A-Z0-9]{6,20}\b/i);
  return m ? m[0].toUpperCase() : null;
}

export type OrdenDeConsulta = typeof ordenes.$inferSelect;

/**
 * Orden con ese código SOLO si el número que escribe es el que el comprador
 * cargó (y confirmó) al comprar. Si no coincide devuelve null, igual que si no
 * existiera: no se revela nada de una compra ajena a quien adivine un código.
 */
export async function buscarOrdenDelRemitente(codigo: string, numero: string): Promise<OrdenDeConsulta | null> {
  const [orden] = await db.select().from(ordenes).where(eq(ordenes.codigo, codigo)).limit(1);
  if (!orden) return null;
  const contacto = normalizarTelefonoPy(orden.contacto);
  return contacto !== null && contacto === numero ? orden : null;
}

/** Texto de respuesta según el estado de la compra. */
export async function textoEstadoOrden(orden: OrdenDeConsulta): Promise<string> {
  const saludo = `Hola ${orden.nombreComprador.split(" ")[0]}, `;
  if (orden.estado === "pagada") {
    return `${saludo}tu pago de la compra ${orden.codigo} está confirmado ✅. Tus entradas están acá: ${urlCompra(orden.codigo)}`;
  }
  if (orden.estado === "rechazada") {
    return `${saludo}no pudimos aprobar la compra ${orden.codigo}. Si creés que es un error, respondé a este mensaje y lo revisamos.`;
  }
  if (orden.estado === "vencida") {
    return `${saludo}la reserva de la compra ${orden.codigo} venció y se liberaron las entradas. Podés volver a comprar en ${origenSitio()}.`;
  }

  // Pendiente: ¿ya mandó comprobante?
  const comprobantes = await db
    .select({ id: comprobantesWhatsapp.id })
    .from(comprobantesWhatsapp)
    .where(
      and(
        eq(comprobantesWhatsapp.ordenId, orden.id),
        inArray(comprobantesWhatsapp.estado, ["pendiente_banco", "confirmado"]),
      ),
    )
    .limit(1);
  if (comprobantes.length > 0) {
    return `${saludo}ya recibimos tu comprobante de la compra ${orden.codigo} y estamos verificando el pago. Te avisamos apenas esté confirmado.`;
  }

  const alias = await obtenerAliasBancarioPlataforma();
  const destino = alias ? ` al alias ${ETIQUETA_ALIAS[alias.tipo]} ${alias.valor}` : "";
  const vence = orden.reservadoHasta ? ` Tu reserva vence el ${formatoFecha(orden.reservadoHasta)}.` : "";
  return `${saludo}recibimos tu pedido ${orden.codigo} por ${formatoGs(orden.total)}. Para pagar, transferí ese monto exacto${destino} y mandame por acá la foto del comprobante.${vence}`;
}

/**
 * Responde a un mensaje de texto del cliente: si trae un código de orden suyo
 * contesta con el estado de la compra; si no, una guía breve. Devuelve el id de
 * la orden reconocida (para atribuirle el comprobante que mande después) o null.
 * Reglas de seguridad: nunca da datos de una orden de otro número, y no
 * contesta más de MAX_RESPUESTAS_POR_HORA veces por hora al mismo número.
 */
export async function prepararRespuesta(
  numero: string,
  texto: string,
  permitirIA = true,
): Promise<{ ordenId: number | null; respuesta: string | null; derivar: string | null }> {
  const codigo = extraerCodigoOrden(texto);
  if (!codigo) {
    if (pidePersona(texto)) return { ordenId: null, respuesta: MENSAJE_DERIVADO, derivar: "El cliente pidió hablar con una persona" };
    if (permitirIA && iaActiva()) {
      const ia = await consultarIA(texto, await historialReciente(numero));
      if (ia?.derivar) return { ordenId: null, respuesta: MENSAJE_DERIVADO, derivar: ia.motivo };
      if (ia) return { ordenId: null, respuesta: ia.respuesta, derivar: null };
    }
    return { ordenId: null, respuesta: MENSAJE_AYUDA, derivar: null };
  }
  const orden = await buscarOrdenDelRemitente(codigo, numero);
  if (!orden) return { ordenId: null, respuesta: MENSAJE_NO_ENCONTRADA, derivar: null };
  return { ordenId: orden.id, respuesta: await textoEstadoOrden(orden), derivar: null };
}

/**
 * Registra el mensaje entrante (abre la ventana de 24 h) y, si es nuevo, lo
 * contesta. Idempotente: Meta reintenta los webhooks y no hay que responder dos veces.
 * Devuelve true si se procesó (false = ya estaba o no se pudo registrar).
 */
export async function manejarTexto(args: { waMessageId: string; numero: string; texto: string }): Promise<boolean> {
  // Antes de gastar nada (la IA cuesta): un reintento de Meta no se procesa de nuevo y,
  // pasado el tope de respuestas por hora, ya no se consulta a la IA.
  if (await mensajeYaRegistrado(args.waMessageId)) return false;
  const hace1h = new Date(Date.now() - 60 * 60 * 1000);
  const topeAlcanzado = (await contarSalientesDesde(args.numero, hace1h)) >= MAX_RESPUESTAS_POR_HORA;

  const { ordenId, respuesta, derivar } = await prepararRespuesta(args.numero, args.texto, !topeAlcanzado);
  const nuevo = await registrarMensaje({
    direccion: "entrante",
    waMessageId: args.waMessageId,
    numero: args.numero,
    ordenId,
    tipo: "texto",
    contenido: args.texto,
    estado: "recibido",
  });
  if (!nuevo) return false;
  if (derivar) await derivarAPersona({ numero: args.numero, motivo: derivar, ultimoMensaje: args.texto, ordenId });
  if (!respuesta || topeAlcanzado) return true;
  await enviarTexto(args.numero, respuesta, { ordenId });
  return true;
}
