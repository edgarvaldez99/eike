import { requerirSesion } from "@/lib/auth/guardas";
import { obtenerEventosGlobal } from "@/server/eventos";
import { Card } from "@/componentes/ui/Card";
import { Pill } from "@/componentes/ui/Pill";
import { AccionesPendienteEvento } from "@/componentes/admin/AccionesPendienteEvento";
import { PILL_ESTADO_EVENTO } from "@/lib/estilosEstado";
import { formatoFecha, formatoGs } from "@/lib/formato";

export const metadata = { robots: { index: false, follow: false } };

const ETIQUETA_ESTADO: Record<string, string> = {
  borrador: "Borrador",
  pendiente_aprobacion: "Pendiente",
  publicado: "En venta",
  rechazado: "Rechazado",
  reprogramado: "Reprogramado",
  finalizado: "Finalizado",
  cancelado: "Cancelado",
};

export default async function PaginaAdminEventos() {
  await requerirSesion(["superadmin"]);
  const eventos = await obtenerEventosGlobal();
  const pendientes = eventos.filter((e) => e.estado === "pendiente_aprobacion");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="mb-3 text-[15px] font-extrabold">Pendientes de aprobación</h2>
        <Card className="p-0">
          <div className="overflow-x-auto">
            <table className="eike-tabla">
              <thead>
                <tr>
                  <th>Evento</th>
                  <th>Organizador</th>
                  <th>Fecha</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {pendientes.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center text-muted">
                      No hay eventos pendientes de aprobación.
                    </td>
                  </tr>
                ) : (
                  pendientes.map((e) => (
                    <tr key={e.id}>
                      <td>{e.nombre}</td>
                      <td className="text-muted">{e.organizadorNombre}</td>
                      <td className="num">{formatoFecha(e.fechaEvento)}</td>
                      <td>
                        <AccionesPendienteEvento eventoId={e.id} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

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
                        <div className="flex flex-col gap-1">
                          <Pill variante={PILL_ESTADO_EVENTO[e.estado]}>{ETIQUETA_ESTADO[e.estado]}</Pill>
                          {e.estado === "rechazado" && e.motivoRechazo ? (
                            <span className="text-[11px] text-muted-dim">Motivo: {e.motivoRechazo}</span>
                          ) : null}
                        </div>
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
    </div>
  );
}
