import { notFound } from "next/navigation";
import { requerirSesion } from "@/lib/auth/guardas";
import { obtenerEventoConTandas } from "@/server/eventos";
import { obtenerDashboard } from "@/server/tickets";
import { Card } from "@/componentes/ui/Card";
import { Metrica } from "@/componentes/ui/Metrica";
import { BarraOcupacion } from "@/componentes/organizador/BarraOcupacion";
import { GraficoTendencia } from "@/componentes/organizador/GraficoTendencia";
import { formatoGs } from "@/lib/formato";

export const metadata = { robots: { index: false, follow: false } };

export default async function PaginaResumenEvento({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requerirSesion(["organizador", "superadmin"]);
  const { id } = await params;
  const evento = await obtenerEventoConTandas(Number(id));
  if (!evento) notFound();

  const dashboard = await obtenerDashboard(evento);
  const capacidadTotal = evento.tandas.reduce((s, t) => s + t.cantidadTotal, 0);
  const totalVendidos = dashboard.totales.disponibles + dashboard.totales.usados;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
        <Metrica etiqueta="Total ventas" valor={formatoGs(dashboard.totales.ingresos)} sub="No incluye cortesías" />
        <Metrica
          etiqueta="Tickets vendidos"
          valor={totalVendidos}
          sub={capacidadTotal > 0 ? `de ${capacidadTotal} en aforo total` : "sin tandas creadas"}
          acento
        />
        <Metrica
          etiqueta="Ventas de hoy"
          valor={formatoGs(dashboard.hoy.ingresos)}
          sub={`${dashboard.hoy.tickets} ticket${dashboard.hoy.tickets === 1 ? "" : "s"}`}
        />
        <Metrica
          etiqueta={
            <>
              Proyección al evento
              <span className="eike-help" title="Estimado según el ritmo de venta de los últimos 14 días">
                ?
              </span>
            </>
          }
          valor={formatoGs(dashboard.proyeccion.ingresos)}
          sub={`≈ ${dashboard.proyeccion.tickets} tickets al cierre`}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.6fr_1fr]">
        <GraficoTendencia tendencia={dashboard.tendencia} />
        <BarraOcupacion
          disponibles={dashboard.totales.disponibles}
          pendientes={dashboard.totales.pendientes}
          cortesias={dashboard.totales.cortesias}
          usados={dashboard.totales.usados}
          capacidadTotal={capacidadTotal}
        />
      </div>

      <Card className="p-0">
        <div className="p-4 pb-0 text-[13.5px] font-bold">Detalle por tanda</div>
        <div className="overflow-x-auto">
          <table className="eike-tabla">
            <thead>
              <tr>
                <th>Tanda</th>
                <th className="right">Capacidad</th>
                <th className="right">Pendientes</th>
                <th className="right">Disponibles</th>
                <th className="right">Cortesías</th>
                <th className="right">Validados</th>
                <th className="right">Anulados</th>
                <th className="right">Ingresos</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.porTanda.map((t) => (
                <tr key={t.id}>
                  <td>{t.nombre}</td>
                  <td className="num right">{t.cantidadTotal}</td>
                  <td className="num right">{t.pendientes}</td>
                  <td className="num right">{t.disponibles}</td>
                  <td className="num right">{t.cortesias}</td>
                  <td className="num right">{t.usados}</td>
                  <td className="num right">{t.anulados}</td>
                  <td className="num right">{formatoGs(t.ingresos)}</td>
                </tr>
              ))}
              <tr className="font-extrabold">
                <td>Total</td>
                <td className="num right">{capacidadTotal}</td>
                <td className="num right">{dashboard.totales.pendientes}</td>
                <td className="num right">{dashboard.totales.disponibles}</td>
                <td className="num right">{dashboard.totales.cortesias}</td>
                <td className="num right">{dashboard.totales.usados}</td>
                <td className="num right">{dashboard.totales.anulados}</td>
                <td className="num right">{formatoGs(dashboard.totales.ingresos)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="p-4 pt-3 text-[11.5px] text-muted-dim">
          &quot;Validados&quot; se activa el día del evento, con el escaneo en puerta.
        </p>
      </Card>
    </div>
  );
}
