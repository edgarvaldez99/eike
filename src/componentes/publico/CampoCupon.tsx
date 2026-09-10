"use client";

import { useState, useTransition } from "react";
import { previsualizarCuponAction } from "@/lib/acciones/tickets-publico";
import { Boton } from "@/componentes/ui/Boton";
import { formatoGs } from "@/lib/formato";

export interface CuponAplicado {
  codigo: string;
  descuento: number;
  total: number;
}

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
  const [codigo, setCodigo] = useState("");
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendiente, startTransition] = useTransition();

  function aplicar() {
    const codigoLimpio = codigo.trim();
    if (!codigoLimpio) return;
    startTransition(async () => {
      const resultado = await previsualizarCuponAction({ eventoId, tandaId, codigo: codigoLimpio });
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
        <Boton
          type="button"
          variante="ghost"
          tamano="sm"
          disabled={pendiente || !codigo.trim()}
          onClick={aplicar}
        >
          {pendiente ? "…" : "Aplicar"}
        </Boton>
      </div>
      {mensaje ? (
        <p className={mensaje.ok ? "text-[12.5px] text-green" : "eike-campo-error"}>{mensaje.texto}</p>
      ) : null}
    </div>
  );
}
