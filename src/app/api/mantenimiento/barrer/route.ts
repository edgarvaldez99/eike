import { NextResponse } from "next/server";
import { barrerReservasVencidas } from "@/server/tickets";
import { barrerCarritosVencidos } from "@/server/carrito";

/**
 * Barrido de reservas vencidas (Fase 3 del plan de mejoras) + de carritos
 * vencidos (Fase 6). Pensado para llamarse cada 60s desde el contenedor
 * cron de docker/compose.prod.yml, o a mano con `pnpm barrer` — nunca desde
 * el navegador, por eso un token de servicio en vez de una sesión de
 * usuario. El de carritos no libera cupo (eso ya es automático, ver
 * server/carrito.ts::recalcularReservada) — solo hace higiene.
 */
export async function POST(req: Request) {
  const token = process.env.MANTENIMIENTO_TOKEN;
  if (!token) {
    // Sin token configurado, el endpoint queda deshabilitado por completo
    // en vez de aceptar cualquier request sin autenticar.
    return NextResponse.json({ error: "Mantenimiento no configurado." }, { status: 503 });
  }
  if (req.headers.get("authorization") !== `Bearer ${token}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const liberados = await barrerReservasVencidas();
  const carritosBarridos = await barrerCarritosVencidos();
  return NextResponse.json({ liberados, carritosBarridos }, { headers: { "Cache-Control": "no-store" } });
}
