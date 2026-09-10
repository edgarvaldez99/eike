import Link from "next/link";
import { notFound } from "next/navigation";
import { requerirSesion } from "@/lib/auth/guardas";
import { obtenerEventoConTandas, obtenerMisEventos } from "@/server/eventos";
import { NavTabs } from "@/componentes/ui/NavTabs";
import { Pill } from "@/componentes/ui/Pill";
import { SwitcherEvento } from "@/componentes/organizador/SwitcherEvento";
import { BotonSolicitarAprobacion } from "@/componentes/organizador/BotonSolicitarAprobacion";
import { PILL_ESTADO_EVENTO } from "@/lib/estilosEstado";
import { formatoFecha } from "@/lib/formato";

const ETIQUETA_ESTADO: Record<string, string> = {
  borrador: "Borrador",
  pendiente_aprobacion: "Pendiente de aprobación",
  publicado: "En venta",
  rechazado: "Rechazado",
  reprogramado: "Reprogramado",
  finalizado: "Finalizado",
  cancelado: "Cancelado",
};

export default async function LayoutDetalleEvento({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const usuario = await requerirSesion(["organizador", "superadmin"]);
  const { id } = await params;
  const eventoId = Number(id);

  const evento = Number.isInteger(eventoId) ? await obtenerEventoConTandas(eventoId) : null;
  if (!evento) notFound();
  if (usuario.rol !== "superadmin" && evento.organizadorId !== usuario.id) notFound();

  const misEventos = await obtenerMisEventos(usuario);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/panel/organizador" className="text-[13px] text-cyan hover:underline">
            ← Mis eventos
          </Link>
          <div className="mb-2 mt-2">
            <SwitcherEvento actual={evento} eventos={misEventos} />
          </div>
          <span className="eike-eyebrow">Evento</span>
          <h1 className="mt-1 text-2xl font-extrabold">{evento.nombre}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-3.5 text-[13.5px] text-muted">
            <span>📅 {formatoFecha(evento.fechaEvento)}</span>
            {evento.lugar ? <span>📍 {evento.lugar}</span> : null}
            <Pill variante={PILL_ESTADO_EVENTO[evento.estado]}>{ETIQUETA_ESTADO[evento.estado]}</Pill>
            {evento.estado === "borrador" || evento.estado === "rechazado" ? (
              <BotonSolicitarAprobacion eventoId={evento.id} tamano="sm" />
            ) : null}
          </div>
          {evento.estado === "rechazado" && evento.motivoRechazo ? (
            <p className="mt-2 max-w-[560px] text-[13px] text-red">
              <strong>Motivo del rechazo:</strong> {evento.motivoRechazo}
            </p>
          ) : null}
        </div>
      </div>

      <NavTabs
        items={[
          { href: `/panel/organizador/eventos/${evento.id}`, etiqueta: "Resumen" },
          { href: `/panel/organizador/eventos/${evento.id}/configuracion`, etiqueta: "Evento y tandas" },
          { href: `/panel/organizador/eventos/${evento.id}/aprobaciones`, etiqueta: "Aprobaciones" },
          { href: `/panel/organizador/eventos/${evento.id}/staff`, etiqueta: "Staff" },
          { href: `/panel/organizador/eventos/${evento.id}/clientes`, etiqueta: "Clientes" },
        ]}
      />

      {children}
    </div>
  );
}
