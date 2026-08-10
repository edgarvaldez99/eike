import { requerirSesion } from "@/lib/auth/guardas";
import { obtenerEventosGlobal } from "@/server/eventos";
import { Card } from "@/componentes/ui/Card";
import { Pill } from "@/componentes/ui/Pill";
import { PILL_ESTADO_EVENTO } from "@/lib/estilosEstado";
import { formatoFecha, formatoGs } from "@/lib/formato";

export const metadata = { robots: { index: false, follow: false } };

const ETIQUETA_ESTADO: Record<string, string> = {
  borrador: "Borrador",
  publicado: "En venta",
  reprogramado: "Reprogramado",
  finalizado: "Finalizado",
  cancelado: "Cancelado",
};

export default async function PaginaAdminEventos() {
  await requerirSesion(["superadmin"]);
  const eventos = await obtenerEventosGlobal();

  return (
    <div>
      <h2 className="mb-3 text-[15px] font-extrabold">Eventos (todas las plataformas)</h2>
      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="eike-tabla">
            <thead>
              <tr>
                <th>Evento</th>
                <th>Organizador</th>
                <th>Fecha</th>
                <th>Estado</th>
                <th className="right">Vendidos</th>
                <th className="right">Sobrantes</th>
                <th className="right">Ingresos</th>
              </tr>
            </thead>
            <tbody>
              {eventos.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center text-muted">
                    Todavía no hay eventos cargados.
                  </td>
                </tr>
              ) : (
                eventos.map((e) => (
                  <tr key={e.id}>
                    <td>{e.nombre}</td>
                    <td className="text-muted">{e.organizadorNombre}</td>
                    <td className="num">{formatoFecha(e.fechaEvento)}</td>
                    <td>
                      <Pill variante={PILL_ESTADO_EVENTO[e.estado]}>{ETIQUETA_ESTADO[e.estado]}</Pill>
                    </td>
                    <td className="num right">{e.ticketsVendidos}</td>
                    <td className="num right">{e.sobrantes}</td>
                    <td className="num right">{formatoGs(e.ingresos)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
