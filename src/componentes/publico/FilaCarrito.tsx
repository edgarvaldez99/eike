"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { actualizarCantidadCarritoAction, quitarDelCarritoAction } from "@/lib/acciones/carrito";
import { formatoGs } from "@/lib/formato";
import type { ItemCarrito } from "@/server/carrito";

export function FilaCarrito({ item }: { item: ItemCarrito }) {
  const [pendiente, startTransition] = useTransition();
  const router = useRouter();
  // Un asiento pineado es SIEMPRE una unidad fija (ver server/carrito.ts) —
  // no tiene stepper de cantidad, solo "Quitar".
  const esAsientoFijo = item.asientoId !== null;

  function cambiarCantidad(nueva: number) {
    startTransition(async () => {
      await actualizarCantidadCarritoAction(null, { item_id: item.id, cantidad: nueva });
      router.refresh();
    });
  }

  function quitar() {
    startTransition(async () => {
      await quitarDelCarritoAction(null, { item_id: item.id });
      router.refresh();
    });
  }

  return (
    <div className="flex items-center justify-between gap-4 p-4">
      <div>
        <div className="font-semibold">
          {item.tandaNombre}
          {item.asientoIdentificador ? ` · Asiento ${item.asientoIdentificador}` : ""}
        </div>
        <div className="text-[13px] text-muted">
          {item.eventoNombre} · {item.precio === 0 ? "Gratis" : formatoGs(item.precio)} c/u
        </div>
      </div>
      <div className="flex items-center gap-3">
        {esAsientoFijo ? (
          <span className="w-6 text-center text-[13px]">{item.cantidad}</span>
        ) : (
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={pendiente}
              onClick={() => cambiarCantidad(item.cantidad - 1)}
              className="eike-btn eike-btn--ghost eike-btn--sm"
              aria-label="Menos"
            >
              −
            </button>
            <span className="w-6 text-center text-[13px]">{item.cantidad}</span>
            <button
              type="button"
              disabled={pendiente}
              onClick={() => cambiarCantidad(item.cantidad + 1)}
              className="eike-btn eike-btn--ghost eike-btn--sm"
              aria-label="Más"
            >
              +
            </button>
          </div>
        )}
        <div className="w-24 text-right font-semibold">{formatoGs(item.subtotal)}</div>
        <button
          type="button"
          disabled={pendiente}
          onClick={quitar}
          className="text-[13px] text-red hover:underline"
        >
          Quitar
        </button>
      </div>
    </div>
  );
}
