import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import { obtenerEventoPublicoPorId } from "@/server/eventos";
import { armarSlugEvento, idDesdeSlug } from "@/lib/slug";
import { formatoFecha, formatoGs } from "@/lib/formato";
import { Card } from "@/componentes/ui/Card";
import { Boton } from "@/componentes/ui/Boton";

export const revalidate = 60;

async function cargarEvento(slugId: string) {
  const id = idDesdeSlug(slugId);
  if (!id) return null;
  return obtenerEventoPublicoPorId(id);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slugId: string }>;
}): Promise<Metadata> {
  const { slugId } = await params;
  const evento = await cargarEvento(slugId);
  if (!evento) return { title: "Evento no encontrado" };

  const descripcion = (evento.descripcion ?? `${evento.nombre} en ${evento.lugar ?? "Paraguay"}`).slice(0, 155);
  const slugCanonico = armarSlugEvento(evento.id, evento.nombre);

  return {
    title: evento.nombre,
    description: descripcion,
    alternates: { canonical: `/eventos/${slugCanonico}` },
    openGraph: {
      type: "website",
      title: evento.nombre,
      description: descripcion,
      url: `/eventos/${slugCanonico}`,
      images: evento.aficheUrl ? [{ url: evento.aficheUrl }] : undefined,
    },
  };
}

export default async function PaginaEvento({
  params,
}: {
  params: Promise<{ slugId: string }>;
}) {
  const { slugId } = await params;
  const evento = await cargarEvento(slugId);
  if (!evento) notFound();

  const slugCanonico = armarSlugEvento(evento.id, evento.nombre);
  if (slugId !== slugCanonico) {
    permanentRedirect(`/eventos/${slugCanonico}`);
  }

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: evento.nombre,
    description: evento.descripcion ?? undefined,
    startDate: evento.fechaEvento.toISOString(),
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: evento.lugar
      ? {
          "@type": "Place",
          name: evento.lugar,
          address: { "@type": "PostalAddress", addressLocality: evento.lugar, addressCountry: "PY" },
        }
      : undefined,
    image: evento.aficheUrl ? [evento.aficheUrl] : undefined,
    organizer: { "@type": "Organization", name: evento.organizadorNombre },
    offers: evento.tandas.map((t) => ({
      "@type": "Offer",
      name: t.nombre,
      price: String(t.precio),
      priceCurrency: "PYG",
      availability:
        t.disponibles > 0 ? "https://schema.org/InStock" : "https://schema.org/SoldOut",
      url: `https://eike.com.py/eventos/${slugCanonico}/comprar?tanda=${t.id}`,
    })),
  };

  return (
    <div className="flex flex-col gap-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[280px_1fr]">
        {evento.aficheUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={evento.aficheUrl}
            alt={evento.nombre}
            className="w-full rounded-[var(--radius-eike)] border border-border object-cover"
          />
        ) : (
          <div className="flex aspect-[3/4] w-full items-center justify-center rounded-[var(--radius-eike)] border border-border bg-surface-2 text-5xl">
            🎟️
          </div>
        )}

        <div>
          <h1 className="text-2xl font-extrabold sm:text-3xl">{evento.nombre}</h1>
          <div className="mt-2 flex flex-col gap-1 text-[14px] text-muted">
            <span>📅 {formatoFecha(evento.fechaEvento)}</span>
            {evento.lugar ? <span>📍 {evento.lugar}</span> : null}
            <span>Organiza: {evento.organizadorNombre}</span>
          </div>
          {evento.descripcion ? <p className="mt-4 text-[14px] text-muted">{evento.descripcion}</p> : null}
        </div>
      </div>

      <Card className="p-0">
        <div className="p-4 pb-0 text-[15px] font-extrabold">Entradas</div>
        <div className="flex flex-col divide-y divide-border-soft">
          {evento.tandas.length === 0 ? (
            <p className="p-4 text-muted">Todavía no hay entradas disponibles para este evento.</p>
          ) : (
            evento.tandas.map((tanda) => (
              <div key={tanda.id} className="flex items-center justify-between gap-4 p-4">
                <div>
                  <div className="font-semibold">{tanda.nombre}</div>
                  <div className="text-[13px] text-muted">
                    {tanda.precio === 0 ? "Gratis" : formatoGs(tanda.precio)} ·{" "}
                    {tanda.disponibles > 0 ? `${tanda.disponibles} disponibles` : "Agotado"}
                  </div>
                </div>
                {tanda.disponibles > 0 ? (
                  <Link
                    href={`/eventos/${slugCanonico}/comprar?tanda=${tanda.id}`}
                    className="eike-btn eike-btn--cyan"
                  >
                    Comprar
                  </Link>
                ) : (
                  <Boton disabled variante="ghost">
                    Agotado
                  </Boton>
                )}
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
