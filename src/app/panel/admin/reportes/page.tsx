import { requerirSesion } from "@/lib/auth/guardas";
import { obtenerEventosGlobal, obtenerRankingOrganizadores } from "@/server/eventos";
import { listarOrganizadores } from "@/server/usuarios";
import { obtenerColaPendientes, obtenerHistorialGlobal, obtenerRankingCompradores } from "@/server/tickets";
import { Card } from "@/componentes/ui/Card";
import { Pill } from "@/componentes/ui/Pill";
import { PILL_ESTADO_TICKET } from "@/lib/estilosEstado";
import { formatoFecha, formatoGs } from "@/lib/formato";
import { ESTADOS_TICKET } from "@/lib/constantes";
import type { EstadoTicket } from "@/lib/constantes";

export const metadata = { robots: { index: false, follow: false } };

const ETIQUETA_ESTADO: Record<string, string> = {
  pendiente: "Pendiente",
  disponible: "Disponible",
  usado: "Usado",
  anulado: "Anulado",
};

export default async function PaginaAdminReportes({
  searchParams,
}: {
  searchParams: Promise<{ organizador_id?: string; evento_id?: string; estado?: string; busqueda?: string }>;
}) {
  await requerirSesion(["superadmin"]);
  const filtros = await searchParams;

  const [rankingOrganizadores, rankingCompradores, colaPendientes, organizadores, eventos] = await Promise.all([
    obtenerRankingOrganizadores(),
    obtenerRankingCompradores(),
    obtenerColaPendientes(),
    listarOrganizadores(),
    obtenerEventosGlobal(),
  ]);

  const historial = await obtenerHistorialGlobal({
    organizadorId: filtros.organizador_id ? Number(filtros.organizador_id) : undefined,
    eventoId: filtros.evento_id ? Number(filtros.evento_id) : undefined,
    estado: filtros.estado || undefined,
    busqueda: filtros.busqueda || undefined,
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="mb-3 text-[15px] font-extrabold">Ranking de organizadores (top ventas)</h2>
        <Card className="p-0">
          <div className="overflow-x-auto">
            <table className="eike-tabla">
              <thead>
                <tr>
                  <th>Organizador</th>
                  <th>Email</th>
                  <th className="right">Tickets vendidos</th>
                  <th className="right">Ingresos</th>
                </tr>
              </thead>
              <tbody>
                {rankingOrganizadores.map((o) => (
                  <tr key={o.organizadorId}>
                    <td>{o.nombre}</td>
                    <td className="text-muted">{o.email}</td>
                    <td className="num right">{o.ticketsVendidos}</td>
                    <td className="num right">{formatoGs(o.ingresos)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div>
        <h2 className="mb-3 text-[15px] font-extrabold">Ranking de compradores (clientes frecuentes)</h2>
        <Card className="p-0">
          <div className="overflow-x-auto">
            <table className="eike-tabla">
              <thead>
                <tr>
                  <th>Comprador</th>
                  <th>Email</th>
                  <th className="right">Tickets comprados</th>
                  <th className="right">Total gastado</th>
                </tr>
              </thead>
              <tbody>
                {rankingCompradores.map((c) => (
                  <tr key={c.compradorId}>
                    <td>{c.nombre}</td>
                    <td className="text-muted">{c.email}</td>
                    <td className="num right">{c.ticketsComprados}</td>
                    <td className="num right">{formatoGs(c.totalGastado)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div>
        <h2 className="mb-3 text-[15px] font-extrabold">Cola operativa: aprobaciones demoradas</h2>
        <Card className="p-0">
          <div className="overflow-x-auto">
            <table className="eike-tabla">
              <thead>
                <tr>
                  <th>Organizador</th>
                  <th className="right">Pendientes</th>
                  <th className="right">Espera promedio (hs)</th>
                  <th className="right">Espera máxima (hs)</th>
                </tr>
              </thead>
              <tbody>
                {colaPendientes.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center text-muted">
                      No hay compras pendientes de aprobación en toda la plataforma.
                    </td>
                  </tr>
                ) : (
                  colaPendientes.map((o) => (
                    <tr key={o.organizadorId}>
                      <td>{o.organizadorNombre}</td>
                      <td className="num right">{o.cantidadPendientes}</td>
                      <td className="num right">{o.horasPromedioEspera}</td>
                      <td className="num right">{o.horasMaxEspera}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div>
        <h2 className="mb-3 text-[15px] font-extrabold">Historial global de tickets / clientes</h2>
        <form className="mb-3 flex flex-wrap gap-3" method="get">
          <select name="organizador_id" defaultValue={filtros.organizador_id ?? ""} className="eike-campo-input w-auto">
            <option value="">Todos los organizadores</option>
            {organizadores.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nombre}
              </option>
            ))}
          </select>
          <select name="evento_id" defaultValue={filtros.evento_id ?? ""} className="eike-campo-input w-auto">
            <option value="">Todos los eventos</option>
            {eventos.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre}
              </option>
            ))}
          </select>
          <select name="estado" defaultValue={filtros.estado ?? ""} className="eike-campo-input w-auto">
            <option value="">Todos los estados</option>
            {ESTADOS_TICKET.map((e) => (
              <option key={e} value={e}>
                {ETIQUETA_ESTADO[e]}
              </option>
            ))}
          </select>
          <input
            name="busqueda"
            defaultValue={filtros.busqueda ?? ""}
            placeholder="Buscar por nombre/cédula/email"
            className="eike-campo-input w-auto"
          />
          <button type="submit" className="eike-btn eike-btn--ghost eike-btn--sm">
            Buscar
          </button>
        </form>
        <Card className="p-0">
          <div className="overflow-x-auto">
            <table className="eike-tabla">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Comprador</th>
                  <th>Cédula</th>
                  <th>Email</th>
                  <th>Evento</th>
                  <th>Organizador</th>
                  <th>Tanda</th>
                  <th className="right">Precio</th>
                  <th>Estado</th>
                  <th>Compra</th>
                </tr>
              </thead>
              <tbody>
                {historial.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="text-center text-muted">
                      No hay tickets para ese filtro.
                    </td>
                  </tr>
                ) : (
                  historial.map((t) => (
                    <tr key={t.id}>
                      <td className="num">{t.codigo}</td>
                      <td>{t.nombreComprador}</td>
                      <td className="num text-muted">{t.cedula ?? "—"}</td>
                      <td className="text-muted">{t.email}</td>
                      <td>{t.eventoNombre}</td>
                      <td className="text-muted">{t.organizadorNombre}</td>
                      <td>{t.tandaNombre}</td>
                      <td className="num right">{formatoGs(t.precio)}</td>
                      <td>
                        <Pill variante={PILL_ESTADO_TICKET[t.estado as EstadoTicket] ?? "neutral"}>
                          {ETIQUETA_ESTADO[t.estado] ?? t.estado}
                        </Pill>
                      </td>
                      <td className="num">{formatoFecha(t.fechaCompra)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {historial.length >= 500 ? (
            <p className="p-4 pt-3 text-[11.5px] text-muted-dim">
              Mostrando los primeros 500 resultados más recientes — afiná los filtros para ver más detalle.
            </p>
          ) : null}
        </Card>
      </div>
    </div>
  );
}
