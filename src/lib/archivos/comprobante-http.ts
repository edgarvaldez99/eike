import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { directorioUploads } from "./comprobante";

/**
 * Respuesta HTTP de un comprobante guardado en disco. Compartido por
 * /api/comprobantes/[ordenId] (con sesión) y /api/compras/[codigo]/comprobante
 * (por código de compra). En la base solo se guarda el basename, y acá se
 * valida contra una regex estricta antes de tocar el filesystem; se transmite
 * en streaming para no cargar el archivo entero en memoria.
 */

const NOMBRE_VALIDO = /^(EIK|ORD)-[A-F0-9]{12}\.(jpg|png|webp|pdf)$/;
const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
};

export async function respuestaComprobante(nombreArchivo: string | null, nombreDescarga: string): Promise<NextResponse> {
  if (!nombreArchivo || !NOMBRE_VALIDO.test(nombreArchivo)) {
    return NextResponse.json({ error: "No encontrado." }, { status: 404 });
  }

  const extension = path.extname(nombreArchivo).toLowerCase();
  const ruta = path.join(directorioUploads(), "comprobantes", nombreArchivo);

  try {
    const info = await stat(ruta);
    return new NextResponse(Readable.toWeb(createReadStream(ruta)) as ReadableStream, {
      headers: {
        "Content-Type": MIME[extension],
        "Content-Length": String(info.size),
        "Content-Disposition": `inline; filename="${nombreDescarga}${extension}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "No encontrado." }, { status: 404 });
  }
}
