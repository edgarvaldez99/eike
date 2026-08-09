import Link from "next/link";
import { Card } from "@/componentes/ui/Card";
import { Pill } from "@/componentes/ui/Pill";
import { PILL_ESTADO_EVENTO } from "@/lib/estilosEstado";
import { formatoFecha, formatoGs } from "@/lib/formato";
import type { EventoConMetricas } from "@/server/eventos";

const ETIQUETA_ESTADO: Record<string, string> = {
  borrador: "Borrador",
  publicado: "En venta",
  reprogramado: "Reprogramado",
  finalizado: "Finalizado",
  cancelado: "Cancelado",
};

export function EventoCard({ evento }: { evento: EventoConMetricas }) {
  return (
    <Link href={`/panel/organizador/eventos/${evento.id}`}>
      <Card className="flex h-full flex-col gap-3 transition-colors hover:border-cyan">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-bold leading-tight">{evento.nombre}</h3>
          <Pill variante={PILL_ESTADO_EVENTO[evento.estado]}>{ETIQUETA_ESTADO[evento.estado]}</Pill>
        </div>
        <div className="flex flex-col gap-0.5 text-[13px] text-muted">
          <span>📅 {formatoFecha(evento.fechaEvento)}</span>
          {evento.lugar ? <span>📍 {evento.lugar}</span> : null}
        </div>
        <div className="mt-auto grid grid-cols-2 gap-3 border-t border-border-soft pt-3">
          <div>
            <div className="eike-eyebrow">Vendidos</div>
            <div className="num text-lg font-bold">{evento.ticketsVendidos}</div>
          </div>
          <div>
            <div className="eike-eyebrow">Ingresos</div>
            <div className="num text-lg font-bold">{formatoGs(evento.ingresos)}</div>
          </div>
        </div>
      </Card>
    </Link>
  );
}
