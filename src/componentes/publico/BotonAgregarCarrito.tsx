"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { agregarAlCarritoAction } from "@/lib/acciones/carrito";
import { Boton } from "@/componentes/ui/Boton";
import { cn } from "@/lib/cn";
import type { AsientoDisponible } from "@/server/tandas";

/**
 * Reemplaza al link directo "Comprar" de la ficha del evento (Fase 6 del
 * plan de mejoras — carrito). Tres casos:
 *  - Tanda general: deja elegir cantidad (lo que pedía el tester).
 *  - Numerada, con `asientosDisponibles` (comprador logueado — la ficha del
 *    evento se los pasa): elegir UN asiento puntual lo agrega ya pineado
 *    (repetible, para juntar varios asientos en el carrito).
 *  - Numerada sin `asientosDisponibles` (invitado): agrega 1 unidad sin
 *    asignar — el asiento se auto-asigna recién en el checkout, mismo
 *    criterio que ya usa un invitado hoy.
 */
export function BotonAgregarCarrito({
  tandaId,
  tipo,
  disponibles,
  asientosDisponibles,
}: {
  tandaId: number;
  tipo: "general" | "numerada";
  disponibles: number;
  asientosDisponibles?: AsientoDisponible[];
}) {
  const [estado, accion, pendiente] = useActionState(agregarAlCarritoAction, null);
  const [cantidad, setCantidad] = useState(1);
  const [asientoElegido, setAsientoElegido] = useState<number | null>(null);
  const tope = Math.min(20, disponibles);
  const requiereAsiento = tipo === "numerada" && asientosDisponibles !== undefined;

  if (estado?.ok) {
    return (
      <span className="text-[13px] text-green">
        Agregado ✓ · <Link href="/carrito" className="underline">Ver carrito</Link>
      </span>
    );
  }

  return (
    <form action={accion} className="flex flex-col items-end gap-2">
      <input type="hidden" name="tanda_id" value={tandaId} />
      <input type="hidden" name="cantidad" value={requiereAsiento ? 1 : cantidad} />
      {asientoElegido ? <input type="hidden" name="asiento_id" value={asientoElegido} /> : null}

      {requiereAsiento ? (
        <div className="flex flex-col items-end gap-1">
          <label className="eike-campo-label">Elegí tu asiento</label>
          {asientosDisponibles!.length === 0 ? (
            <p className="text-[13px] text-muted">No quedan asientos disponibles.</p>
          ) : (
            <div className="flex max-w-xs flex-wrap justify-end gap-2">
              {asientosDisponibles!.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setAsientoElegido(a.id)}
                  className={cn(
                    "eike-btn eike-btn--sm",
                    asientoElegido === a.id ? "eike-btn--cyan" : "eike-btn--ghost",
                  )}
                >
                  {a.identificador}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        {tipo === "general" ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setCantidad((c) => Math.max(1, c - 1))}
              className="eike-btn eike-btn--ghost eike-btn--sm"
              aria-label="Menos"
            >
              −
            </button>
            <span className="w-6 text-center text-[13px]">{cantidad}</span>
            <button
              type="button"
              onClick={() => setCantidad((c) => Math.min(tope, c + 1))}
              className="eike-btn eike-btn--ghost eike-btn--sm"
              aria-label="Más"
            >
              +
            </button>
          </div>
        ) : null}
        <Boton
          type="submit"
          disabled={pendiente || (requiereAsiento && asientosDisponibles!.length > 0 && !asientoElegido)}
        >
          {pendiente ? "Agregando…" : "Agregar al carrito"}
        </Boton>
      </div>
      {estado && !estado.ok ? <p className="eike-campo-error">{estado.error}</p> : null}
    </form>
  );
}
