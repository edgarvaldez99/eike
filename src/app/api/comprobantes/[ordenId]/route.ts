import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/cliente";
import { ordenes, tickets } from "@/db/esquema";
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
 *
 * Fase 5 del plan de mejoras: el comprobante ahora vive en la ORDEN, no en
 * el ticket (una orden puede juntar varios tickets con un solo comprobante
 * desde el carrito de la Fase 6). Acepta ambos prefijos de código
 * ("EIK-" y "ORD-") porque las órdenes creadas por el backfill de la Fase 5
 * no tienen archivo propio — el archivo de esos tickets viejos se quedó
 * donde estaba, y acá se cae a leerlo de ahí (COALESCE).
 */

const NOMBRE_VALIDO = /^(EIK|ORD)-[A-F0-9]{12}\.(jpg|png|webp|pdf)$/;
const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
};

export async function GET(_req: Request, { params }: { params: Promise<{ ordenId: string }> }) {
  const usuario = await usuarioActual();
  if (!usuario) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const { ordenId } = await params;
  const id = Number(ordenId);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "No encontrado." }, { status: 404 });
  }

  const [orden] = await db
    .select({
      comprobanteArchivo: ordenes.comprobanteArchivo,
      compradorId: ordenes.compradorId,
      organizadorId: ordenes.organizadorId,
    })
    .from(ordenes)
    .where(eq(ordenes.id, id))
    .limit(1);

  if (!orden) {
    return NextResponse.json({ error: "No encontrado." }, { status: 404 });
  }

  const autorizado =
    usuario.rol === "superadmin" ||
    (usuario.rol === "organizador" && orden.organizadorId === usuario.id) ||
    (usuario.rol === "comprador" && orden.compradorId === usuario.id);
  if (!autorizado) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  // Legacy (backfill de la Fase 5): la orden no tiene archivo propio, el
  // archivo se quedó en su único ticket.
  let nombreArchivo = orden.comprobanteArchivo;
  if (!nombreArchivo) {
    const [ticketLegacy] = await db
      .select({ comprobanteArchivo: tickets.comprobanteArchivo })
      .from(tickets)
      .where(eq(tickets.ordenId, id))
      .limit(1);
    nombreArchivo = ticketLegacy?.comprobanteArchivo ?? null;
  }

  if (!nombreArchivo || !NOMBRE_VALIDO.test(nombreArchivo)) {
    return NextResponse.json({ error: "No encontrado." }, { status: 404 });
  }

  const extension = path.extname(nombreArchivo).toLowerCase();
  const ruta = path.join(process.env.UPLOADS_DIR || "./.data/uploads", "comprobantes", nombreArchivo);

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
