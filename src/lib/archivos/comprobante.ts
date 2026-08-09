import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { ErrorNegocio } from "@/lib/errores";

const MAX_BYTES = 8 * 1024 * 1024;

function directorioUploads(): string {
  return process.env.UPLOADS_DIR || "./.data/uploads";
}

export interface ComprobantePreparado {
  buffer: Buffer;
  extension: "jpg" | "png" | "webp" | "pdf";
}

/**
 * Valida el comprobante (imagen o PDF) y lo deja listo en memoria — sin
 * escribir a disco todavía. Puerto de tickets.php::guardarComprobante,
 * con una diferencia deliberada: acá el comprobante NO se reencodea (a
 * diferencia del afiche): es evidencia de un pago real, se guarda
 * exactamente como lo subió el comprador.
 */
export async function prepararComprobante(archivo: File): Promise<ComprobantePreparado> {
  if (archivo.size === 0) {
    throw new ErrorNegocio("Hace falta subir el comprobante de pago.");
  }
  if (archivo.size > MAX_BYTES) {
    throw new ErrorNegocio("El comprobante supera el tamaño máximo permitido (8MB).");
  }

  const buffer = Buffer.from(await archivo.arrayBuffer());

  if (buffer.subarray(0, 4).toString("latin1") === "%PDF") {
    return { buffer, extension: "pdf" };
  }

  try {
    const metadata = await sharp(buffer, { limitInputPixels: 268_402_689 }).metadata();
    if (metadata.format === "jpeg") return { buffer, extension: "jpg" };
    if (metadata.format === "png") return { buffer, extension: "png" };
    if (metadata.format === "webp") return { buffer, extension: "webp" };
  } catch {
    // no era ninguna imagen reconocida — cae al error genérico de abajo
  }

  throw new ErrorNegocio("El comprobante tiene que ser una imagen (JPG/PNG/WEBP) o un PDF.");
}

/**
 * Escribe el comprobante ya validado a disco. Se llama DESPUÉS de que la
 * transacción de la compra hizo COMMIT (ver server/tickets.ts::comprarTicket)
 * — así, si la compra falla y hace ROLLBACK, nunca queda un archivo
 * huérfano sin ticket asociado.
 */
export async function escribirComprobante(comprobante: ComprobantePreparado, codigo: string): Promise<string> {
  const nombreArchivo = `${codigo}.${comprobante.extension}`;
  const dir = path.join(directorioUploads(), "comprobantes");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, nombreArchivo), comprobante.buffer);
  return nombreArchivo;
}
