import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { obtenerEventoPublicoPorId } from "@/server/eventos";
import { obtenerAsientosDisponibles } from "@/server/tandas";
import { idDesdeSlug } from "@/lib/slug";
import { usuarioActual } from "@/lib/auth/sesion";
import { Card } from "@/componentes/ui/Card";
import { formatoGs } from "@/lib/formato";
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

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4">
      <div>
        <span className="eike-eyebrow">Completar datos</span>
        <h1 className="mt-1 text-xl font-extrabold">{evento.nombre}</h1>
        <p className="text-[13px] text-muted">
          {tanda.nombre} · {tanda.precio === 0 ? "Gratis" : formatoGs(tanda.precio)}
        </p>
      </div>
      <Card>
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
