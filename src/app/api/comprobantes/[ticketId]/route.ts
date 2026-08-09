import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/cliente";
import { eventos, tickets } from "@/db/esquema";
import { usuarioActual } from "@/lib/auth/sesion";

/**
 * Puerto de api/comprobante_ver.php, con dos mejoras deliberadas (ver plan
 * de migración §3(d)):
 *  - En la base solo se guarda el basename del archivo (nunca la ruta), y
 *    acá se valida contra una regex estricta antes de tocar el filesystem —
 *    reemplaza el `realpath()` + `str_starts_with()` del PHP.
 *  - Se transmite en streaming (`createReadStream`) en vez de cargar el
 *    archivo entero en memoria con `readfile()` — relevante con la RAM
 *    acotada de la VM de producción.
 */

const NOMBRE_VALIDO = /^EIK-[A-F0-9]{12}\.(jpg|png|webp|pdf)$/;
const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
};

export async function GET(_req: Request, { params }: { params: Promise<{ ticketId: string }> }) {
  const usuario = await usuarioActual();
  if (!usuario) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const { ticketId } = await params;
  const id = Number(ticketId);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "No encontrado." }, { status: 404 });
  }

  const [fila] = await db
    .select({
      comprobanteArchivo: tickets.comprobanteArchivo,
      compradorId: tickets.compradorId,
      organizadorId: eventos.organizadorId,
    })
    .from(tickets)
    .innerJoin(eventos, eq(eventos.id, tickets.eventoId))
    .where(eq(tickets.id, id))
    .limit(1);

  if (!fila || !fila.comprobanteArchivo) {
    return NextResponse.json({ error: "No encontrado." }, { status: 404 });
  }

  const autorizado =
    usuario.rol === "superadmin" ||
    (usuario.rol === "organizador" && fila.organizadorId === usuario.id) ||
    (usuario.rol === "comprador" && fila.compradorId === usuario.id);
  if (!autorizado) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  if (!NOMBRE_VALIDO.test(fila.comprobanteArchivo)) {
    return NextResponse.json({ error: "No encontrado." }, { status: 404 });
  }

  const extension = path.extname(fila.comprobanteArchivo).toLowerCase();
  const ruta = path.join(process.env.UPLOADS_DIR || "./.data/uploads", "comprobantes", fila.comprobanteArchivo);

  try {
    const info = await stat(ruta);
    return new NextResponse(Readable.toWeb(createReadStream(ruta)) as ReadableStream, {
      headers: {
        "Content-Type": MIME[extension] ?? "application/octet-stream",
        "Content-Length": String(info.size),
        "Content-Disposition": `inline; filename="comprobante-${id}${extension}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "No encontrado." }, { status: 404 });
  }
}
