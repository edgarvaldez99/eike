import { NextResponse } from "next/server";
import { z } from "zod";
import { usuarioActual } from "@/lib/auth/sesion";
import { puedeEscanearEvento } from "@/lib/auth/guardas";
import { validarTicket } from "@/server/escaner";

/**
 * No es un Server Action a propósito: Next serializa las Server Actions de
 * la misma request (se ejecutan de a una), y el escáner dispara
 * validaciones en ráfaga desde el bucle de la cámara — una cola serializada
 * arruinaría la UX en la puerta. Puerto de escaner.php?accion=validar.
 */
const esquemaValidar = z.object({
  codigo: z.string().trim().min(1),
  evento_id: z.coerce.number().int().positive(),
});

export async function POST(req: Request) {
  const usuario = await usuarioActual();
  if (!usuario || !["superadmin", "organizador", "staff"].includes(usuario.rol)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const cuerpo = await req.json().catch(() => null);
  const parseo = esquemaValidar.safeParse(cuerpo);
  if (!parseo.success) {
    return NextResponse.json({ error: "Faltan codigo o evento_id." }, { status: 400 });
  }

  const puedeEscanear = await puedeEscanearEvento(parseo.data.evento_id, usuario);
  if (!puedeEscanear) {
    return NextResponse.json({ error: "No estás asignado a ese evento." }, { status: 403 });
  }

  const respuesta = await validarTicket(parseo.data.codigo, parseo.data.evento_id);
  return NextResponse.json(respuesta, { headers: { "Cache-Control": "no-store" } });
}
