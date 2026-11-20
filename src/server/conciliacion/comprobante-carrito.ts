import { ocrComprobante } from "./ocr";
import { cruzarComprobantesConAvisos } from "./cruce";
import { registrarComprobante } from "./comprobantes";
import { parsearComprobanteOcr } from "./parser-comprobante";

export interface DepsComprobanteCarrito {
  ocr: typeof ocrComprobante;
}
const depsPorDefecto: DepsComprobanteCarrito = { ocr: ocrComprobante };

const MIME: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", pdf: "application/pdf" };

export interface ComprobanteDeCarrito {
  ordenId: number;
  codigoOrden: string;
  total: number;
  nombreComprador: string;
  /** Número de WhatsApp del comprador (normalizado). */
  contacto: string | null;
  /** Nombre del archivo guardado (`comprobantes/<codigo>.<ext>`). */
  archivo: string;
  buffer: Buffer;
  extension: "jpg" | "png" | "webp" | "pdf";
}

/**
 * Lee con OCR la foto del comprobante que el comprador subió en el checkout del
 * carrito y la registra igual que un comprobante de WhatsApp (misma lectura, mismo
 * pre-check, misma tabla y mismo cruce con el aviso del banco), solo que acá ya se
 * sabe a qué compra pertenece. Corre DESPUÉS de responderle al comprador (el OCR
 * puede tardar decenas de segundos) y nunca lanza: un fallo del OCR queda registrado
 * como comprobante "sin_datos" para que lo revise el superadmin a mano.
 */
export async function procesarComprobanteCarrito(
  comprobante: ComprobanteDeCarrito,
  deps: DepsComprobanteCarrito = depsPorDefecto,
): Promise<void> {
  try {
    let textoOcr: string | null = null;
    const problemas: string[] = [];
    try {
      textoOcr = await deps.ocr(comprobante.buffer, MIME[comprobante.extension], comprobante.archivo);
    } catch (error) {
      problemas.push(`OCR falló: ${error instanceof Error ? error.message : "error desconocido"}`);
    }
    await registrarComprobante({
      waMessageId: `carrito:${comprobante.codigoOrden}`,
      waFrom: comprobante.contacto ?? "",
      nombrePerfil: comprobante.nombreComprador,
      caption: null,
      archivo: comprobante.archivo,
      textoOcr,
      problemas,
      datos: parsearComprobanteOcr(textoOcr ?? ""),
      origen: "carrito",
      orden: { id: comprobante.ordenId, total: comprobante.total },
    });
    await cruzarComprobantesConAvisos();
  } catch (error) {
    console.error(
      `No se pudo procesar el comprobante de la compra ${comprobante.codigoOrden}:`,
      error instanceof Error ? error.message : error,
    );
  }
}
