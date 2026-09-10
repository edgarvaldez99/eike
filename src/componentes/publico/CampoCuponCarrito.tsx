"use client";

import { useState, useTransition } from "react";
import { previsualizarCuponCarritoAction } from "@/lib/acciones/carrito";
import { Boton } from "@/componentes/ui/Boton";
import { formatoGs } from "@/lib/formato";

export interface CuponCarritoAplicado {
  codigo: string;
  descuento: number;
  total: number;
}

/** Igual que CampoCupon, pero sobre TODO el carrito (Fase 6) — el cupón
 * puede tocar solo algunas de sus tandas (ver server/cupones.ts::
 * consumirCuponCarrito), así que el total mostrado ya viene con eso resuelto. */
export function CampoCuponCarrito({
  onResultado,
}: {
  onResultado: (resultado: CuponCarritoAplicado | null) => void;
}) {
  const [codigo, setCodigo] = useState("");
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendiente, startTransition] = useTransition();

  function aplicar() {
    const codigoLimpio = codigo.trim();
    if (!codigoLimpio) return;
    startTransition(async () => {
      const resultado = await previsualizarCuponCarritoAction(codigoLimpio);
      if (resultado.ok) {
        setMensaje({
          ok: true,
          texto: `Cupón aplicado: -${formatoGs(resultado.descuento)} · Total a transferir: ${formatoGs(resultado.total)}`,
        });
        onResultado({ codigo: codigoLimpio, descuento: resultado.descuento, total: resultado.total });
      } else {
        setMensaje({ ok: false, texto: resultado.error });
        onResultado(null);
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="eike-campo-label">Código de descuento (opcional)</label>
      <div className="flex gap-2">
        <input
          type="text"
          value={codigo}
          onChange={(e) => {
            setCodigo(e.target.value);
            setMensaje(null);
            onResultado(null);
          }}
          className="eike-campo-input"
          placeholder="Ej: VERANO2026"
        />
        <Boton type="button" variante="ghost" tamano="sm" disabled={pendiente || !codigo.trim()} onClick={aplicar}>
          {pendiente ? "…" : "Aplicar"}
        </Boton>
      </div>
      {mensaje ? <p className={mensaje.ok ? "text-[12.5px] text-green" : "eike-campo-error"}>{mensaje.texto}</p> : null}
    </div>
  );
}
