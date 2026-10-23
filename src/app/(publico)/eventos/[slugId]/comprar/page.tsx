import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { obtenerEventoPublicoPorId } from "@/server/eventos";
import { obtenerAsientosDisponibles } from "@/server/tandas";
import { acentoEvento } from "@/lib/acentoEvento";
import { idDesdeSlug } from "@/lib/slug";
import { usuarioActual } from "@/lib/auth/sesion";
import { Card } from "@/componentes/ui/Card";
import { Icono } from "@/componentes/ui/Icono";
import { formatoGs } from "@/lib/formato";
import { cn } from "@/lib/cn";
import { FormularioCompra } from "@/componentes/publico/FormularioCompra";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function PaginaComprar({
  params,
  searchParams,
}: {
  params: Promise<{ slugId: string }>;
  searchParams: Promise<{ tanda?: string }>;
}) {
  const { slugId } = await params;
  const id = idDesdeSlug(slugId);
  if (!id) notFound();

  const evento = await obtenerEventoPublicoPorId(id);
  if (!evento) notFound();

  const { tanda: tandaIdParam } = await searchParams;
  const tanda = evento.tandas.find((t) => t.id === Number(tandaIdParam));
  if (!tanda) notFound();
  if (tanda.disponibles <= 0) notFound();

  const usuario = await usuarioActual();
  const compradorSesion = usuario && (usuario.rol === "comprador" || usuario.rol === "superadmin") ? usuario : null;

  const asientosDisponibles =
    tanda.tipo === "numerada" && compradorSesion ? await obtenerAsientosDisponibles(tanda.id) : [];

  const acento = acentoEvento(evento.id);
  const claseAcentoBorde = acento === "amarillo" ? "border-amarillo" : "border-lila";

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4">
      <div>
        <span className="eike-eyebrow">Completar datos</span>
        <h1 className="mt-1 text-xl font-extrabold">{evento.nombre}</h1>
        <p className="text-[13px] text-muted">
          {tanda.nombre} ·{" "}
          <span className="text-amarillo-texto font-semibold">
            {tanda.precio === 0 ? "Gratis" : formatoGs(tanda.precio)}
          </span>
        </p>
      </div>

      <Card className={cn("flex items-center gap-3 border-2 p-3", claseAcentoBorde)}>
        {evento.aficheUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={evento.aficheUrl} alt="" className="h-14 w-14 flex-none rounded-[var(--radius-eike-sm)] object-cover" />
        ) : (
          <div className="flex h-14 w-14 flex-none items-center justify-center rounded-[var(--radius-eike-sm)] bg-surface-2 text-xl text-muted-dim">
            <Icono nombre="ticket" />
          </div>
        )}
        <div className="flex-1">
          <div className="font-semibold">{evento.nombre}</div>
          <div className="text-[13px] text-muted">{tanda.nombre}</div>
        </div>
        <div className="text-amarillo-texto font-bold">{tanda.precio === 0 ? "Gratis" : formatoGs(tanda.precio)}</div>
      </Card>

      <Card className="border-2 border-lila">
        <FormularioCompra
          eventoId={evento.id}
          tanda={tanda}
          usuario={compradorSesion}
          asientosDisponibles={asientosDisponibles}
        />
      </Card>
    </div>
  );
}
