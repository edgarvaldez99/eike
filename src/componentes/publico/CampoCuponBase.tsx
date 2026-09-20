"use client";

import { useId, useState, useTransition } from "react";
import { Boton } from "@/componentes/ui/Boton";
import { formatoGs } from "@/lib/formato";

export interface ResultadoCupon {
  codigo: string;
  descuento: number;
  total: number;
}

type RespuestaAplicar =
  | { ok: true; descuento: number; total: number }
  | { ok: false; error: string };

/**
 * Base compartida de CampoCupon (una tanda) y CampoCuponCarrito (todo el
 * carrito) — la única diferencia real entre ambos es a qué Server Action
 * apunta `onAplicar`, así que ese es el único punto de variación.
 */
export function CampoCuponBase({
  onAplicar,
  onResultado,
}: {
  onAplicar: (codigo: string) => Promise<RespuestaAplicar>;
  onResultado: (resultado: ResultadoCupon | null) => void;
}) {
  const idCampo = useId();
  const [codigo, setCodigo] = useState("");
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendiente, startTransition] = useTransition();

  function aplicar() {
    const codigoLimpio = codigo.trim();
    if (!codigoLimpio) return;
    startTransition(async () => {
      const resultado = await onAplicar(codigoLimpio);
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
      <label htmlFor={idCampo} className="eike-campo-label">
        Código de descuento (opcional)
      </label>
      <div className="flex gap-2">
        <input
          id={idCampo}
          type="text"
          value={codigo}
          onChange={(e) => {
            setCodigo(e.target.value);
            setMensaje(null);
            onResultado(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              aplicar();
            }
          }}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          enterKeyHint="done"
          className="eike-campo-input"
          placeholder="Ej: VERANO2026"
        />
        <Boton type="button" variante="ghost" tamano="sm" disabled={pendiente} onClick={aplicar}>
          {pendiente ? "Aplicando…" : "Aplicar"}
        </Boton>
      </div>
      {mensaje ? (
        <p
          role={mensaje.ok ? "status" : "alert"}
          className={mensaje.ok ? "text-[12.5px] text-green" : "eike-campo-error"}
        >
          {mensaje.texto}
        </p>
      ) : null}
    </div>
  );
}
