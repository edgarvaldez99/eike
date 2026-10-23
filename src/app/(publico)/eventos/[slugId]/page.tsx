import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import { obtenerEventoPublicoPorId } from "@/server/eventos";
import { obtenerAsientosDisponibles, type AsientoDisponible } from "@/server/tandas";
import { usuarioActual } from "@/lib/auth/sesion";
import { acentoEvento } from "@/lib/acentoEvento";
import { armarSlugEvento, idDesdeSlug } from "@/lib/slug";
import { formatoFechaPill, formatoGs } from "@/lib/formato";
import { cn } from "@/lib/cn";
import { Card } from "@/componentes/ui/Card";
import { Boton } from "@/componentes/ui/Boton";
import { Icono } from "@/componentes/ui/Icono";
import { BotonCompartir } from "@/componentes/publico/BotonCompartir";
import { BotonAgregarCarrito } from "@/componentes/publico/BotonAgregarCarrito";

// Fase 6 del plan de mejoras: con reservas de carrito, `disponibles` cambia
// cada vez que alguien agrega/saca algo de un carrito — ya no alcanza con
// revalidar cada 60s (ISR), tiene que leer siempre el número real.
export const dynamic = "force-dynamic";

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

  // Elegir un asiento puntual en el carrito (Fase 6 del plan de mejoras)
  // solo está disponible para un comprador logueado — un invitado sigue
  // agregando "N numeradas sin asignar" (auto-asignadas en el checkout),
  // mismo criterio que ya regía la compra directa.
  const usuario = await usuarioActual();
  const compradorSesion = usuario && (usuario.rol === "comprador" || usuario.rol === "superadmin") ? usuario : null;
  const asientosPorTanda = new Map<number, AsientoDisponible[]>();
  if (compradorSesion) {
    await Promise.all(
      evento.tandas
        .filter((t) => t.tipo === "numerada")
        .map(async (t) => {
          asientosPorTanda.set(t.id, await obtenerAsientosDisponibles(t.id));
        }),
    );
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

  const acento = acentoEvento(evento.id);
  const claseAcentoBorde = acento === "amarillo" ? "border-amarillo" : "border-lila";
  const claseAcentoDivisor = acento === "amarillo" ? "divide-amarillo" : "divide-lila";

  return (
    <div className="flex flex-col gap-6 lg:gap-[100px]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <Link href="/" className="flex w-fit items-center gap-1.5 text-[14px] text-muted hover:text-text">
        <span aria-hidden="true">←</span> Volver a eventos
      </Link>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[280px_1fr] lg:grid-cols-[385px_1fr] lg:items-center lg:gap-x-12">
        {evento.aficheUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={evento.aficheUrl}
            alt={evento.nombre}
            loading="lazy"
            className={cn("eike-ticket aspect-[253/284] w-full border-2 object-cover", claseAcentoBorde)}
          />
        ) : (
          <div
            className={cn(
              "eike-ticket flex aspect-[253/284] w-full items-center justify-center border-2 bg-surface-2 text-5xl text-muted-dim",
              claseAcentoBorde,
            )}
          >
            <Icono nombre="ticket" />
          </div>
        )}

        <div>
          <h1 className="text-3xl font-bold tracking-[-0.02em] sm:text-[44px] sm:leading-[1.1]">{evento.nombre}</h1>
          <div className="mt-2 flex flex-col gap-1.5 text-[14px]">
            <span className="flex items-center gap-1.5">
              <Icono nombre="calendario" className="text-muted" />
              <span className="font-semibold">Fecha:</span>{" "}
              <span className="font-mono text-[13px] tracking-wide text-muted">
                {formatoFechaPill(evento.fechaEvento, { conDiaSemana: true })}
              </span>
            </span>
            {evento.lugar ? (
              <span className="flex items-center gap-1.5">
                <Icono nombre="ubicacion" className="text-muted" />
                <span className="font-semibold">Lugar:</span>{" "}
                <span className="font-mono text-[13px] tracking-wide text-muted">{evento.lugar}</span>
              </span>
            ) : null}
            {evento.direccion ? (
              <span className="flex items-center gap-1.5">
                <span className="font-semibold">Dirección:</span>{" "}
                <span className="font-mono text-[13px] tracking-wide text-muted">{evento.direccion}</span>
              </span>
            ) : null}
            <span className="text-muted">Organiza: {evento.organizadorNombre}</span>
          </div>
          {evento.descripcion ? <p className="mt-4 text-[14px] text-muted">{evento.descripcion}</p> : null}
          <div className="mt-4">
            <BotonCompartir
              titulo={evento.nombre}
              url={`https://eike.com.py/eventos/${slugCanonico}`}
            />
          </div>
        </div>
      </div>

      <Card className={cn("border-2 p-0", claseAcentoBorde)}>
        <div className={cn("flex h-16 items-center border-b px-4 font-[family-name:var(--font-titulos)] text-[20px] font-bold sm:px-[26px]", claseAcentoBorde)}>
          Entradas
        </div>
        <div className={cn("flex flex-col divide-y divide-dashed", claseAcentoDivisor)}>
          {evento.tandas.length === 0 ? (
            <p className="p-4 text-muted">Todavía no hay entradas disponibles para este evento.</p>
          ) : (
            evento.tandas.map((tanda) => (
              <div key={tanda.id} className="flex min-h-[90px] items-center justify-between gap-4 px-4 py-4 sm:px-[26px]">
                <div>
                  <div className="text-[16.5px] font-bold">{tanda.nombre}</div>
                  <div className="font-mono text-[13px]">
                    <span className="text-amarillo-texto font-[family-name:var(--font-precio)] text-[15px] font-medium">
                      {tanda.precio === 0 ? "Gratis" : formatoGs(tanda.precio)}
                    </span>{" "}
                    · {tanda.disponibles > 0 ? `${tanda.disponibles} disponibles` : "Agotado"}
                  </div>
                </div>
                {tanda.disponibles > 0 ? (
                  <BotonAgregarCarrito
                    tandaId={tanda.id}
                    tipo={tanda.tipo}
                    disponibles={tanda.disponibles}
                    acento={acento}
                    asientosDisponibles={
                      tanda.tipo === "numerada" && compradorSesion ? (asientosPorTanda.get(tanda.id) ?? []) : undefined
                    }
                  />
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
