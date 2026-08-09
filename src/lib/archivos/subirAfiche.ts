import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { ErrorNegocio } from "@/lib/errores";

const MAX_BYTES = 8 * 1024 * 1024;

function directorioUploads(): string {
  return process.env.UPLOADS_DIR || "./.data/uploads";
}

/**
 * Puerto de api/upload.php?accion=afiche, con una mejora deliberada: en vez
 * de solo validar con getimagesize() y guardar el archivo tal cual, se
 * reencodea con `sharp` — valida el contenido real (si no es una imagen,
 * sharp tira), quema la orientación EXIF y descarta el resto de los
 * metadatos, y normaliza a JPEG ≤1200px de ancho (menos peso en disco).
 * El PHP viejo permitía superadmin=❌ subir afiches (bug); acá el rol lo
 * decide el Server Action que llama a esta función, no esta función.
 */
export async function guardarAfiche(archivo: File, organizadorId: number): Promise<string> {
  if (archivo.size === 0) {
    throw new ErrorNegocio("No se recibió ningún archivo.");
  }
  if (archivo.size > MAX_BYTES) {
    throw new ErrorNegocio("La imagen supera el tamaño máximo permitido (8MB).");
  }

  const buffer = Buffer.from(await archivo.arrayBuffer());

  let normalizado: Buffer;
  try {
    normalizado = await sharp(buffer, { limitInputPixels: 268_402_689 })
      .rotate()
      .resize({ width: 1200, withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
  } catch {
    throw new ErrorNegocio("El archivo no es una imagen válida.");
  }

  const dirOrganizador = path.join(directorioUploads(), "afiches", String(organizadorId));
  await mkdir(dirOrganizador, { recursive: true });

  const nombreArchivo = `${randomBytes(16).toString("hex")}.jpg`;
  await writeFile(path.join(dirOrganizador, nombreArchivo), normalizado);

  return `/uploads/afiches/${organizadorId}/${nombreArchivo}`;
}
