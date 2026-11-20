import { registrarMensaje, ventanaAbierta } from "./mensajes";
import { VERSION_GRAPH } from "./api";

/**
 * Envío de mensajes por la Cloud API. Mientras WHATSAPP_ENVIO_ACTIVO no sea
 * exactamente "true" NO se llama a Meta: el mensaje queda en la bitácora como
 * 'simulado' (así se puede probar el flujo completo antes de que la cuenta de
 * negocio esté verificada). Nunca lanza: un fallo de WhatsApp no debe romper
 * quien lo invoca (aprobar una compra, responder un webhook); se devuelve el
 * resultado y queda registrado.
 */
export type ResultadoEnvio =
  | { estado: "simulado" }
  | { estado: "enviado"; waMessageId: string }
  | { estado: "fallido"; error: string }
  | { estado: "sin_ventana" };

export function envioActivo(): boolean {
  return process.env.WHATSAPP_ENVIO_ACTIVO === "true";
}

interface OpcionesEnvio {
  ordenId?: number | null;
}

async function llamarMessages(cuerpo: Record<string, unknown>): Promise<{ waMessageId: string } | { error: string }> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const idNumero = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !idNumero) return { error: "Falta WHATSAPP_ACCESS_TOKEN o WHATSAPP_PHONE_NUMBER_ID." };
  try {
    const respuesta = await fetch(`https://graph.facebook.com/${VERSION_GRAPH()}/${encodeURIComponent(idNumero)}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", ...cuerpo }),
      signal: AbortSignal.timeout(30_000),
    });
    const datos = (await respuesta.json().catch(() => ({}))) as {
      messages?: { id?: string }[];
      error?: { message?: string; code?: number };
    };
    const id = datos.messages?.[0]?.id;
    if (respuesta.ok && id) return { waMessageId: id };
    const detalle = datos.error ? `${datos.error.code ?? ""} ${datos.error.message ?? ""}`.trim() : `HTTP ${respuesta.status}`;
    return { error: detalle };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "error de red" };
  }
}

async function enviar(
  numero: string,
  tipo: "texto" | "plantilla",
  contenido: string,
  cuerpo: Record<string, unknown>,
  opciones: OpcionesEnvio,
): Promise<ResultadoEnvio> {
  const base = { direccion: "saliente" as const, numero, ordenId: opciones.ordenId ?? null, tipo, contenido };
  if (!envioActivo()) {
    await registrarMensaje({ ...base, waMessageId: null, estado: "simulado" });
    return { estado: "simulado" };
  }
  const resultado = await llamarMessages({ to: numero, ...cuerpo });
  if ("error" in resultado) {
    console.error(`No se pudo enviar el WhatsApp a ${numero.slice(0, 6)}…: ${resultado.error}`);
    await registrarMensaje({ ...base, waMessageId: null, estado: "fallido", error: resultado.error });
    return { estado: "fallido", error: resultado.error };
  }
  await registrarMensaje({ ...base, waMessageId: resultado.waMessageId, estado: "enviado" });
  return { estado: "enviado", waMessageId: resultado.waMessageId };
}

/**
 * Texto libre: solo dentro de la ventana de 24 h desde el último mensaje del
 * cliente (sale gratis y no cuenta para el límite diario). Fuera de ella Meta
 * lo rechaza, así que ni se intenta: devuelve "sin_ventana" y el llamador
 * decide (plantilla o correo).
 */
export async function enviarTexto(numero: string, texto: string, opciones: OpcionesEnvio = {}): Promise<ResultadoEnvio> {
  if (!(await ventanaAbierta(numero))) return { estado: "sin_ventana" };
  return enviar(
    numero,
    "texto",
    texto,
    { type: "text", text: { body: texto, preview_url: true } },
    opciones,
  );
}

export interface Plantilla {
  nombre: string;
  idioma?: string;
  /** Valores de {{1}}, {{2}}… en orden. */
  parametros: string[];
}

/** Plantilla aprobada por Meta: única forma de escribirle a quien no nos escribió en las últimas 24 h. */
export async function enviarPlantilla(numero: string, plantilla: Plantilla, opciones: OpcionesEnvio = {}): Promise<ResultadoEnvio> {
  return enviar(
    numero,
    "plantilla",
    plantilla.nombre,
    {
      type: "template",
      template: {
        name: plantilla.nombre,
        language: { code: plantilla.idioma ?? "es" },
        components:
          plantilla.parametros.length > 0
            ? [{ type: "body", parameters: plantilla.parametros.map((text) => ({ type: "text", text })) }]
            : [],
      },
    },
    opciones,
  );
}
