import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { DIAS_ATRIBUCION_REFERIDO } from "@/lib/constantes";

/**
 * Captura ?ref=CODIGO en la ficha de un evento y lo guarda en una cookie
 * (Fase 8 del plan de mejoras — atribución de referidos). Es el lugar
 * correcto para este efecto: un Server Component solo puede LEER cookies
 * durante el render, nunca escribirlas.
 *
 * La cookie es texto plano, sin sellar a propósito: un código de referido
 * ya es información pública (viaja en la URL, pensado para compartirse), y
 * la protección real contra fraude está en esVentaReferidaValida()
 * (server/referidos.ts) — comparando identidad, no confiando en la cookie.
 * Sellarla solo agregaría complejidad de Edge runtime sin bloquear nada
 * que esa validación no bloquee ya.
 *
 * Last-touch gana: cada visita con ?ref= pisa la cookie anterior.
 *
 * Antes vivía en middleware.ts — Next.js 16 renombró la convención de
 * archivo a proxy.ts (mismo runtime, misma API; ver
 * https://nextjs.org/docs/messages/middleware-to-proxy).
 */
export function proxy(req: NextRequest) {
  const ref = req.nextUrl.searchParams.get("ref");
  if (!ref) return NextResponse.next();

  const res = NextResponse.next();
  res.cookies.set("eike_ref", ref.slice(0, 12), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
    maxAge: DIAS_ATRIBUCION_REFERIDO * 24 * 60 * 60,
    path: "/",
  });
  return res;
}

export const config = {
  matcher: ["/eventos/:path*"],
};
