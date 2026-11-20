import { normalizarTelefonoPy } from "@/lib/telefono";
import { urlCompra } from "@/lib/url-sitio";
import { enviarPlantilla, enviarTexto, type ResultadoEnvio } from "./enviar";

/**
 * Aviso por WhatsApp al comprador cuando se aprueba o rechaza su compra.
 * Orden de intentos: texto libre si el cliente nos escribió en las últimas 24 h
 * (gratis); si no, la plantilla aprobada (solo para "aprobada"); si tampoco se
 * puede, no se manda nada: el correo es el canal de respaldo y sale siempre.
 * Nunca lanza.
 */
export interface DatosAvisoWhatsapp {
  ordenId: number;
  codigo: string;
  nombreComprador: string;
  contacto: string | null;
  eventoNombre: string;
  resultado: "aprobada" | "rechazada";
  /** Número de WhatsApp de la plataforma, para que reclame quien pagó de verdad. */
  numeroWhatsapp: string | null;
}

export function textoAviso(datos: Pick<DatosAvisoWhatsapp, "codigo" | "nombreComprador" | "eventoNombre" | "resultado" | "numeroWhatsapp">): string {
  const { codigo, nombreComprador, eventoNombre, resultado, numeroWhatsapp } = datos;
  if (resultado === "aprobada") {
    return `¡Hola ${nombreComprador}! Tu compra ${codigo} para ${eventoNombre} fue aprobada. Tus entradas con el código QR están acá: ${urlCompra(codigo)}`;
  }
  const reclamo = numeroWhatsapp
    ? "Si ya pagaste, mandanos tu comprobante por este chat y lo revisamos."
    : "Si ya pagaste, respondé al correo que te enviamos con tu comprobante y lo revisamos.";
  return `Hola ${nombreComprador}, no pudimos verificar el pago de tu compra ${codigo} para ${eventoNombre}, así que la rechazamos y liberamos tus entradas. ${reclamo}`;
}

export async function avisarResultadoPorWhatsapp(datos: DatosAvisoWhatsapp): Promise<ResultadoEnvio | "sin_numero"> {
  try {
    const numero = normalizarTelefonoPy(datos.contacto);
    if (numero === null) return "sin_numero";
    const opciones = { ordenId: datos.ordenId };

    const texto = await enviarTexto(numero, textoAviso(datos), opciones);
    if (texto.estado !== "sin_ventana") return texto;
    if (datos.resultado !== "aprobada") return texto;
    return await enviarPlantilla(
      numero,
      { nombre: "entradas_aprobadas", parametros: [datos.nombreComprador, datos.eventoNombre, urlCompra(datos.codigo)] },
      opciones,
    );
  } catch (error) {
    console.error(`No se pudo avisar por WhatsApp (${datos.codigo}):`, error);
    return { estado: "fallido", error: error instanceof Error ? error.message : "error" };
  }
}
