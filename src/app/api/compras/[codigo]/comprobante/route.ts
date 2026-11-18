import { NextResponse } from "next/server";
import { respuestaComprobante } from "@/lib/archivos/comprobante-http";
import { buscarComprobantePendiente } from "@/server/comprobante-compra";

/**
 * Comprobante de una compra, por su código — para el botón "Compartir
 * comprobante" de la pantalla de la compra. Sin sesión (el comprador puede ser
 * un invitado): el código de la compra es la credencial. Solo mientras la
 * compra está pendiente, ver buscarComprobantePendiente.
 */
const CODIGO_VALIDO = /^(EIK|ORD)-[A-Z0-9-]{1,40}$/;

export async function GET(_req: Request, { params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  if (!CODIGO_VALIDO.test(codigo)) {
    return NextResponse.json({ error: "No encontrado." }, { status: 404 });
  }

  const archivo = await buscarComprobantePendiente(codigo);
  return respuestaComprobante(archivo, `comprobante-${codigo}`);
}
