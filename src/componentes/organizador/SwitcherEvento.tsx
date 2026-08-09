"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatoFecha } from "@/lib/formato";

export interface EventoParaSwitcher {
  id: number;
  nombre: string;
  fechaEvento: Date;
  lugar: string | null;
  estado: string;
}

const PILL_LIVE: Record<string, { texto: string; clase: string }> = {
  publicado: { texto: "En venta", clase: "text-green" },
  borrador: { texto: "Borrador", clase: "text-muted" },
  reprogramado: { texto: "Reprogramado", clase: "text-amber" },
  finalizado: { texto: "Finalizado", clase: "text-muted" },
  cancelado: { texto: "Cancelado", clase: "text-red" },
};

export function SwitcherEvento({
  actual,
  eventos,
}: {
  actual: EventoParaSwitcher;
  eventos: EventoParaSwitcher[];
}) {
  const [abierto, setAbierto] = useState(false);
  const router = useRouter();

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="flex max-w-[280px] items-center gap-2 rounded-full border border-border bg-surface-2 px-3.5 py-1.5 text-[13px] font-semibold hover:border-cyan"
      >
        <span
          className={`h-1.5 w-1.5 flex-none rounded-full ${
            actual.estado === "publicado" ? "bg-green" : "bg-muted-dim"
          }`}
        />
        <span className="truncate">{actual.nombre}</span>
        <span className="text-muted">▾</span>
      </button>
      {abierto ? (
        <div className="absolute top-[calc(100%+6px)] left-0 z-40 w-[300px] rounded-[var(--radius-eike)] border border-border bg-surface-3 p-1.5 shadow-xl">
          {eventos.map((evento) => (
            <button
              key={evento.id}
              type="button"
              onClick={() => {
                setAbierto(false);
                router.push(`/panel/organizador/eventos/${evento.id}`);
              }}
              className={`flex w-full items-center justify-between gap-2.5 rounded-[var(--radius-eike-sm)] px-2.5 py-2 text-left hover:bg-surface-2 ${
                evento.id === actual.id ? "bg-cyan-dim" : ""
              }`}
            >
              <div>
                <div className="text-[13px] font-semibold">{evento.nombre}</div>
                <div className="text-[11.5px] text-muted">{formatoFecha(evento.fechaEvento)}</div>
              </div>
              <span className={`text-[11px] font-bold uppercase ${PILL_LIVE[evento.estado]?.clase ?? "text-muted"}`}>
                {PILL_LIVE[evento.estado]?.texto ?? evento.estado}
              </span>
            </button>
          ))}
          <div className="my-1.5 h-px bg-border" />
          <Link
            href="/panel/organizador"
            className="block w-full rounded-[var(--radius-eike-sm)] px-2.5 py-2 text-left text-[12.5px] font-bold uppercase tracking-wide text-cyan hover:bg-surface-2"
            onClick={() => setAbierto(false)}
          >
            Ver todos mis eventos
          </Link>
        </div>
      ) : null}
    </div>
  );
}
