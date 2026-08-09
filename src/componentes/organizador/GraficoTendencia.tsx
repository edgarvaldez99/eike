"use client";

import { useId, useState } from "react";
import { Card } from "@/componentes/ui/Card";
import { formatoGs } from "@/lib/formato";

export interface PuntoTendencia {
  fecha: string; // "YYYY-MM-DD"
  ventas: number; // ingresos del día
  tickets: number;
  cancelaciones: number;
}

const ANCHO = 640;
const ALTO = 200;
const PADDING_SUP = 14;

function etiquetaFechaCorta(fechaISO: string): string {
  const [, mes, dia] = fechaISO.split("-");
  const meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${dia} ${meses[Number(mes) - 1]}`;
}

export function GraficoTendencia({ tendencia }: { tendencia: PuntoTendencia[] }) {
  const [serie, setSerie] = useState<"venta" | "cancelaciones">("venta");
  const idGradiente = useId();

  const valores = tendencia.map((p) => (serie === "venta" ? p.ventas : p.cancelaciones));
  const maximo = Math.max(1, ...valores);
  const n = tendencia.length;

  const puntos = valores.map((v, i) => {
    const x = n > 1 ? (i / (n - 1)) * ANCHO : 0;
    const y = PADDING_SUP + (1 - v / maximo) * (ALTO - PADDING_SUP);
    return { x, y, v };
  });

  const lineaPath = puntos.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const areaPath = `${lineaPath} L${ANCHO},${ALTO} L0,${ALTO} Z`;
  const ultimo = puntos.at(-1);

  return (
    <Card>
      <div className="mb-3.5 flex items-center justify-between gap-2.5">
        <span className="text-[13.5px] font-bold">Venta diaria</span>
        <div className="flex gap-1 rounded-full border border-border bg-surface-2 p-[3px]">
          {(["venta", "cancelaciones"] as const).map((opcion) => (
            <button
              key={opcion}
              type="button"
              onClick={() => setSerie(opcion)}
              className={`rounded-full px-2.5 py-1 text-[11.5px] font-bold ${
                serie === opcion ? "bg-cyan text-[#04222b]" : "text-muted"
              }`}
            >
              {opcion === "venta" ? "Venta" : "Cancelaciones"}
            </button>
          ))}
        </div>
      </div>

      <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} className="block w-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id={idGradiente} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-cyan)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--color-cyan)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map((frac) => (
          <line
            key={frac}
            x1={0}
            x2={ANCHO}
            y1={PADDING_SUP + frac * (ALTO - PADDING_SUP)}
            y2={PADDING_SUP + frac * (ALTO - PADDING_SUP)}
            stroke="var(--color-border-soft)"
            strokeWidth={1}
          />
        ))}
        <path d={areaPath} fill={`url(#${idGradiente})`} />
        <path d={lineaPath} fill="none" stroke="var(--color-cyan)" strokeWidth={2} />
        {ultimo ? (
          <>
            <circle cx={ultimo.x} cy={ultimo.y} r={3.5} fill="var(--color-cyan)" />
            <text
              x={Math.min(ultimo.x, ANCHO - 90)}
              y={Math.max(ultimo.y - 10, 12)}
              fontSize={11}
              fill="var(--color-text)"
              fontWeight={700}
            >
              {serie === "venta" ? formatoGs(ultimo.v) : `${ultimo.v} cancel.`}
            </text>
          </>
        ) : null}
      </svg>
      <div className="mt-1.5 flex justify-between text-[11px] text-muted-dim">
        <span>{tendencia[0] ? etiquetaFechaCorta(tendencia[0].fecha) : ""}</span>
        <span>{tendencia.at(-1) ? `${etiquetaFechaCorta(tendencia.at(-1)!.fecha)} (hoy)` : ""}</span>
      </div>
    </Card>
  );
}
