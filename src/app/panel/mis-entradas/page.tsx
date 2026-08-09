import Link from "next/link";
import { requerirSesion } from "@/lib/auth/guardas";
import { obtenerMisTickets } from "@/server/tickets";
import { Card } from "@/componentes/ui/Card";
import { Metrica } from "@/componentes/ui/Metrica";
import { Pill } from "@/componentes/ui/Pill";
import { PILL_ESTADO_TICKET } from "@/lib/estilosEstado";
import { formatoFecha, formatoGs } from "@/lib/formato";
import { ahoraMs } from "@/lib/fechas";
import type { EstadoTicket } from "@/lib/constantes";
import { ESTADOS_TICKET } from "@/lib/constantes";

export const metadata = { robots: { index: false, follow: false } };

const ETIQUETA_ESTADO: Record<string, string> = {
  pendiente: "Pendiente",
  disponible: "Disponible",
  usado: "Usado",
  anulado: "Anulado",
};

export default async function PaginaMisEntradas({
  searchParams,
}: {
  searchParams: Promise<{ evento_id?: string; estado?: string }>;
}) {
  const usuario = await requerirSesion(["comprador", "superadmin"]);
  const tickets = await obtenerMisTickets(usuario.id);

  const confirmados = tickets.filter((t) => t.estado === "disponible" || t.estado === "usado");
  const totalGastado = confirmados.reduce((s, t) => s + t.precio, 0);
  const pendientes = tickets.filter((t) => t.estado === "pendiente").length;
  const usados = tickets.filter((t) => t.estado === "usado").length;
  const eventosDistintos = new Set(confirmados.map((t) => t.eventoId)).size;
  const ahora = ahoraMs();
  const proximos = confirmados
    .filter((t) => t.estado === "disponible" && t.fechaEvento.getTime() >= ahora)
    .sort((a, b) => a.fechaEvento.getTime() - b.fechaEvento.getTime());
  const proximoTexto = proximos[0] ? `${proximos[0].eventoNombre} — ${formatoFecha(proximos[0].fechaEvento)}` : "—";

  const { evento_id: eventoIdFiltro, estado: estadoFiltro } = await searchParams;
  const eventosUnicos = [...new Map(tickets.map((t) => [t.eventoId, t.eventoNombre])).entries()];
  const historial = tickets.filter(
    (t) =>
      (!eventoIdFiltro || String(t.eventoId) === eventoIdFiltro) &&
      (!estadoFiltro || t.estado === estadoFiltro),
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <span className="eike-eyebrow">Panel</span>
        <h1 className="mt-1 text-2xl font-extrabold">Mis entradas</h1>
      </div>

      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-6">
        <Metrica etiqueta="Tickets" valor={confirmados.length} acento />
        <Metrica etiqueta="Gastado" valor={formatoGs(totalGastado)} />
        <Metrica etiqueta="Próximo evento" valor={proximoTexto} />
        <Metrica etiqueta="Pendientes" valor={pendientes} />
        <Metrica etiqueta="Eventos distintos" valor={eventosDistintos} />
        <Metrica etiqueta="Usados" valor={usados} />
      </div>

      {tickets.length === 0 ? (
        <div className="eike-card border-dashed p-8 text-center text-muted">
          Todavía no compraste ningún ticket.{" "}
          <Link href="/eventos" className="text-cyan hover:underline">
            Ver eventos
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {tickets.map((t) => (
            <Link key={t.id} href={`/entradas/${t.codigo}`} className="eike-card flex flex-col gap-2 p-4">
              <h3 className="text-[14px] font-bold leading-tight">{t.eventoNombre}</h3>
              <div className="text-[12.5px] text-muted">{formatoFecha(t.fechaEvento)}</div>
              <Pill variante={PILL_ESTADO_TICKET[t.estado as EstadoTicket] ?? "neutral"} className="w-fit">
                {ETIQUETA_ESTADO[t.estado] ?? t.estado}
              </Pill>
              <div className="text-[12px] text-muted-dim">
                {t.tandaNombre}
                {t.asientoIdentificador ? ` · ${t.asientoIdentificador}` : ""}
              </div>
            </Link>
          ))}
        </div>
      )}

      <div>
        <h2 className="mb-3 text-[15px] font-extrabold">Historial de compras</h2>
        <form className="mb-3 flex flex-wrap gap-3" method="get">
          <select name="evento_id" defaultValue={eventoIdFiltro ?? ""} className="eike-campo-input w-auto">
            <option value="">Todos los eventos</option>
            {eventosUnicos.map(([id, nombre]) => (
              <option key={id} value={id}>
                {nombre}
              </option>
            ))}
          </select>
          <select name="estado" defaultValue={estadoFiltro ?? ""} className="eike-campo-input w-auto">
            <option value="">Todos los estados</option>
            {ESTADOS_TICKET.map((e) => (
              <option key={e} value={e}>
                {ETIQUETA_ESTADO[e]}
              </option>
            ))}
          </select>
          <button type="submit" className="eike-btn eike-btn--ghost eike-btn--sm">
            Filtrar
          </button>
        </form>
        <Card className="p-0">
          <div className="overflow-x-auto">
            <table className="eike-tabla">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Evento</th>
                  <th>Tanda</th>
                  <th className="right">Precio</th>
                  <th>Estado</th>
                  <th>Comprado</th>
                </tr>
              </thead>
              <tbody>
                {historial.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center text-muted">
                      No hay compras para ese filtro.
                    </td>
                  </tr>
                ) : (
                  historial.map((t) => (
                    <tr key={t.id}>
                      <td className="num">
                        <Link href={`/entradas/${t.codigo}`} className="text-cyan hover:underline">
                          {t.codigo}
                        </Link>
                      </td>
                      <td>{t.eventoNombre}</td>
                      <td>
                        {t.tandaNombre}
                        {t.asientoIdentificador ? ` · ${t.asientoIdentificador}` : ""}
                      </td>
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
        </Card>
      </div>
    </div>
  );
}
