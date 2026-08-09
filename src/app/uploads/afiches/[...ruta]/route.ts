import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";

/**
 * Sirve los afiches subidos SOLO en desarrollo — en producción, Caddy
 * intercepta `/uploads/afiches/*` antes de que llegue a Next (ver plan de
 * migración §6.2/Caddyfile), así que este handler nunca corre ahí. Existe
 * para que `pnpm dev` se comporte igual que producción sin configurar nada
 * aparte. Los afiches son públicos por diseño (a diferencia de los
 * comprobantes, que van por un handler con control de acceso — Fase 5).
 */

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

export async function GET(_req: Request, { params }: { params: Promise<{ ruta: string[] }> }) {
  const { ruta } = await params;

  // Solo basename+subcarpeta de organizador, nunca ".." — anti path-traversal.
  if (ruta.some((segmento) => segmento.includes("..") || segmento.includes("/") || segmento.includes("\\"))) {
    return NextResponse.json({ error: "Ruta inválida." }, { status: 400 });
  }

  const extension = path.extname(ruta.at(-1) ?? "").toLowerCase();
  const tipoMime = MIME[extension];
  if (!tipoMime) {
    return NextResponse.json({ error: "No encontrado." }, { status: 404 });
  }

  const raiz = path.resolve(process.env.UPLOADS_DIR || "./.data/uploads", "afiches");
  const rutaArchivo = path.resolve(raiz, ...ruta);
  if (!rutaArchivo.startsWith(raiz)) {
    return NextResponse.json({ error: "Ruta inválida." }, { status: 400 });
  }

  try {
    const info = await stat(rutaArchivo);
    return new NextResponse(Readable.toWeb(createReadStream(rutaArchivo)) as ReadableStream, {
      headers: {
        "Content-Type": tipoMime,
        "Content-Length": String(info.size),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "No encontrado." }, { status: 404 });
  }
}
