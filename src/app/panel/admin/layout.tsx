import { requerirSesion } from "@/lib/auth/guardas";
import { obtenerMetricasGlobales } from "@/server/usuarios";
import { resumenOrganizador } from "@/server/liquidaciones";
import { Metrica } from "@/componentes/ui/Metrica";
import { NavTabs } from "@/componentes/ui/NavTabs";
import { formatoGs } from "@/lib/formato";

export const dynamic = "force-dynamic";

export default async function LayoutAdmin({ children }: { children: React.ReactNode }) {
  await requerirSesion(["superadmin"]);
  const [metricas, retiro] = await Promise.all([obtenerMetricasGlobales(), resumenOrganizador(null)]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <span className="eike-eyebrow">Panel superadmin</span>
        <h1 className="mt-1 text-2xl font-extrabold">Eike — administración</h1>
      </div>

      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-5">
        <Metrica etiqueta="Organizadores activos" valor={metricas.organizadoresPorEstado.activo ?? 0} acento />
        <Metrica
          etiqueta="Pendientes de aprobación"
          valor={metricas.organizadoresPorEstado.pendiente_aprobacion ?? 0}
        />
        <Metrica etiqueta="Compradores registrados" valor={metricas.compradoresRegistrados} />
        <Metrica etiqueta="Eventos publicados" valor={metricas.eventosPorEstado.publicado ?? 0} />
        <Metrica etiqueta="Tickets vendidos" valor={metricas.ticketsVendidosTotal} />
        <Metrica etiqueta="Ticket promedio" valor={formatoGs(metricas.ticketPromedio)} />
        <Metrica etiqueta="Ingresos totales" valor={formatoGs(metricas.ingresosTotales)} />
        <Metrica etiqueta="Ya retirado" valor={formatoGs(retiro.retirado)} />
        <Metrica etiqueta="Pendiente de retiro" valor={formatoGs(retiro.pendiente)} />
      </div>

      <NavTabs
        items={[
          { href: "/panel/admin", etiqueta: "Organizadores" },
          { href: "/panel/admin/eventos", etiqueta: "Eventos" },
          { href: "/panel/admin/liquidaciones", etiqueta: "Liquidaciones" },
          { href: "/panel/admin/reportes", etiqueta: "Reportes" },
        ]}
      />

      {children}
    </div>
  );
}
