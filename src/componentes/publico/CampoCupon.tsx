"use client";

import { previsualizarCuponAction } from "@/lib/acciones/tickets-publico";
import { CampoCuponBase, type ResultadoCupon } from "@/componentes/publico/CampoCuponBase";

export type CuponAplicado = ResultadoCupon;

/**
 * Cupón de descuento (Fase 7 del plan de mejoras). Solo previsualiza — no
 * consume el cupón (eso lo hace comprarTicket, dentro de su transacción).
 * Necesario porque el comprador tiene que saber CUÁNTO transferir ANTES de
 * subir el comprobante: sin esto, se enteraría del descuento recién
 * después de completar toda la compra.
 */
export function CampoCupon({
  eventoId,
  tandaId,
  onResultado,
}: {
  eventoId: number;
  tandaId: number;
  onResultado: (resultado: CuponAplicado | null) => void;
}) {
  return (
    <CampoCuponBase
      onAplicar={(codigo) => previsualizarCuponAction({ eventoId, tandaId, codigo })}
      onResultado={onResultado}
    />
  );
}
