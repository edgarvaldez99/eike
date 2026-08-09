import Link from "next/link";
import { Pill } from "@/componentes/ui/Pill";
import { armarSlugEvento } from "@/lib/slug";
import { formatoFecha } from "@/lib/formato";
import type { EventoPublico } from "@/server/eventos";

export function TarjetaEvento({ evento }: { evento: EventoPublico }) {
  return (
    <Link
      href={`/eventos/${armarSlugEvento(evento.id, evento.nombre)}`}
      className="eike-card flex h-full flex-col overflow-hidden transition-colors hover:border-cyan"
    >
      {evento.aficheUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- afiches ya optimizados a JPEG en la subida (sharp), servidos same-origin
        <img src={evento.aficheUrl} alt="" loading="lazy" className="aspect-[3/4] w-full object-cover" />
      ) : (
        <div className="flex aspect-[3/4] w-full items-center justify-center bg-surface-2 text-4xl">🎟️</div>
      )}
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <h3 className="font-bold leading-tight">{evento.nombre}</h3>
        <div className="text-[13px] text-muted">{formatoFecha(evento.fechaEvento)}</div>
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
