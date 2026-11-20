"use client";

import { useId, useState } from "react";
import type { AvisoBancoResumen } from "@/server/aprobaciones-admin";
import { FilaAvisoBanco } from "@/componentes/admin/FilaAvisoBanco";
import { avisoEnVentana } from "@/lib/fecha-aviso";

/** Ventana por defecto, en minutos, desde la fecha/hora del comprobante. */
const VENTANA_POR_DEFECTO = 5;

/**
 * Avisos del banco sin asociar de una compra, dentro de una ventana de tiempo que
 * arranca en la fecha/hora del comprobante (la que leyó el OCR de la foto): un
 * aviso no puede ser anterior a la transferencia, y el real llega pocos minutos
 * después. Por defecto 5 minutos; el superadmin puede cambiar el inicio, el largo
 * de la ventana o quitarle el límite. Si el OCR no pudo leer la fecha, arranca sin
 * filtro y se puede escribir a mano.
 */
export function CandidatosCorreoBanco({
  candidatos,
  totalOrden,
  hayComprobanteWa,
  desdeInicial,
}: {
  candidatos: AvisoBancoResumen[];
  totalOrden: number;
  hayComprobanteWa: boolean;
  /** "AAAA-MM-DDTHH:MM" de la foto del comprobante, o null si no se pudo leer. */
  desdeInicial: string | null;
}) {
  const idDesde = useId();
  const idMinutos = useId();
  const [desde, setDesde] = useState(desdeInicial ?? "");
  const [minutos, setMinutos] = useState<number | null>(VENTANA_POR_DEFECTO);
  const visibles = candidatos.filter((a) => avisoEnVentana(a.fechaOperacion, desde, minutos));
  const ocultos = candidatos.length - visibles.length;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <label htmlFor={idDesde} className="text-muted">
          {desdeInicial ? "Desde la hora del comprobante:" : "Desde (el OCR no pudo leer la hora del comprobante):"}
        </label>
        <input
          id={idDesde}
          type="datetime-local"
          value={desde}
          onChange={(e) => setDesde(e.target.value)}
          className="eike-campo-input !h-8 !w-auto !py-0 !text-[12.5px]"
        />
        <label htmlFor={idMinutos} className="text-muted">
          Ventana (min):
        </label>
        <input
          id={idMinutos}
          type="number"
          min={1}
          value={minutos ?? ""}
          placeholder="sin límite"
          onChange={(e) => setMinutos(e.target.value === "" ? null : Math.max(1, Number(e.target.value)))}
          className="eike-campo-input !h-8 !w-20 !py-0 !text-[12.5px]"
        />
        <button type="button" onClick={() => setMinutos((m) => (m ?? 0) + VENTANA_POR_DEFECTO)} className="text-lila-bright underline">
          +{VENTANA_POR_DEFECTO} min
        </button>
        <button type="button" onClick={() => setMinutos(null)} className="text-lila-bright underline">
          Sin límite
        </button>
        {desde !== (desdeInicial ?? "") || minutos !== VENTANA_POR_DEFECTO ? (
          <button
            type="button"
            onClick={() => {
              setDesde(desdeInicial ?? "");
              setMinutos(VENTANA_POR_DEFECTO);
            }}
            className="text-lila-bright underline"
          >
            Restablecer
          </button>
        ) : null}
      </div>
      {visibles.map((a) => (
        <FilaAvisoBanco key={a.id} aviso={a} hayComprobanteWa={hayComprobanteWa} totalOrden={totalOrden} />
      ))}
      {ocultos > 0 ? (
        <p className="text-muted">
          {ocultos === 1 ? "1 aviso fuera" : `${ocultos} avisos fuera`} de esta ventana. Ampliala (+{VENTANA_POR_DEFECTO} min o
          sin límite) para verl{ocultos === 1 ? "o" : "os"}.
        </p>
      ) : null}
      {visibles.length === 0 ? <p className="text-muted">Ningún aviso llegó dentro de esta ventana.</p> : null}
    </div>
  );
}
