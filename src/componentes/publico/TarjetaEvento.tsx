import Link from "next/link";
import { Icono } from "@/componentes/ui/Icono";
import { Pill } from "@/componentes/ui/Pill";
import { acentoEvento } from "@/lib/acentoEvento";
import { armarSlugEvento } from "@/lib/slug";
import { formatoFechaPill } from "@/lib/formato";
import { cn } from "@/lib/cn";
import type { EventoPublico } from "@/server/eventos";

export function TarjetaEvento({ evento }: { evento: EventoPublico }) {
  const acento = acentoEvento(evento.id);
  return (
    <Link
      href={`/eventos/${armarSlugEvento(evento.id, evento.nombre)}`}
      className={cn(
        "eike-card eike-ticket flex h-full w-full max-w-[253px] flex-col overflow-hidden border-2",
        acento === "amarillo" ? "border-amarillo" : "border-lila",
      )}
    >
      {evento.aficheUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- afiches ya optimizados a JPEG en la subida (sharp), servidos same-origin
        <img
          src={evento.aficheUrl}
          alt={evento.nombre}
          loading="lazy"
          className="aspect-[253/284] w-full object-cover"
        />
      ) : (
        <div className="flex aspect-[253/284] w-full items-center justify-center bg-surface-2 text-4xl text-muted-dim">
          <Icono nombre="ticket" />
        </div>
      )}
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <h3 className="line-clamp-2 text-[18px] font-bold leading-tight">{evento.nombre}</h3>
        <div
          className={cn(
            "w-fit rounded-[8.5px] border px-2 py-1.5 font-mono text-[11.7px] text-text",
            acento === "amarillo" ? "border-amarillo" : "border-lila",
          )}
        >
          {formatoFechaPill(evento.fechaEvento)}
        </div>
        {evento.lugar ? <div className="text-[13px] text-muted">{evento.lugar}</div> : null}
        {evento.esGratuito ? (
          <Pill variante="ok" className="mt-1 w-fit">
            Gratis
          </Pill>
        ) : null}
      </div>
    </Link>
  );
}
