import { NextResponse } from "next/server";
import { leerCorreoBanco } from "@/server/conciliacion/correo";

/**
 * Lee el buzón de pagos y concilia los avisos de transferencia del banco
 * con las órdenes pendientes. Mismo esquema de autenticación que
 * /api/mantenimiento/barrer (token de servicio, nunca sesión de usuario);
 * pensado para dispararse cada 1–2 min desde un cron.
 */
export async function POST(req: Request) {
  const token = process.env.MANTENIMIENTO_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "Mantenimiento no configurado." }, { status: 503 });
  }
  if (req.headers.get("authorization") !== `Bearer ${token}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  try {
    const resumen = await leerCorreoBanco();
    return NextResponse.json(resumen, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Falló la lectura del buzón de pagos:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "No se pudo leer el buzón de pagos." }, { status: 502 });
  }
}
