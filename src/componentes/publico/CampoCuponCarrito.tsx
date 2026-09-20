"use client";

import { previsualizarCuponCarritoAction } from "@/lib/acciones/carrito";
import { CampoCuponBase, type ResultadoCupon } from "@/componentes/publico/CampoCuponBase";

export type CuponCarritoAplicado = ResultadoCupon;

/** Igual que CampoCupon, pero sobre TODO el carrito (Fase 6) — el cupón
 * puede tocar solo algunas de sus tandas (ver server/cupones.ts::
 * consumirCuponCarrito), así que el total mostrado ya viene con eso resuelto. */
export function CampoCuponCarrito({
  onResultado,
}: {
  onResultado: (resultado: CuponCarritoAplicado | null) => void;
}) {
  return <CampoCuponBase onAplicar={previsualizarCuponCarritoAction} onResultado={onResultado} />;
}
