import { notFound } from "next/navigation";
import { requerirSesion } from "@/lib/auth/guardas";
import { obtenerEventoConTandas } from "@/server/eventos";
import { obtenerDetalleTickets } from "@/server/tickets";
import { Card } from "@/componentes/ui/Card";
import { Pill } from "@/componentes/ui/Pill";
import { PILL_ESTADO_TICKET } from "@/lib/estilosEstado";
import { formatoFecha } from "@/lib/formato";
import { ModalCortesia } from "@/componentes/organizador/ModalCortesia";
import { ESTADOS_TICKET } from "@/lib/constantes";

export const metadata = { robots: { index: false, follow: false } };

const ETIQUETA_ESTADO: Record<string, string> = {
  pendiente: "Pendiente",
  disponible: "Disponible",
  usado: "Usado",
  anulado: "Anulado",
};

export default async function PaginaClientes({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tanda_id?: string; estado?: string }>;
}) {
  await requerirSesion(["organizador", "superadmin"]);
  const { id } = await params;
  const eventoId = Number(id);
  const evento = await obtenerEventoConTandas(eventoId);
  if (!evento) notFound();

  const filtros = await searchParams;
  const tandaId = filtros.tanda_id ? Number(filtros.tanda_id) : undefined;
  const estadoFiltro = filtros.estado && ESTADOS_TICKET.includes(filtros.estado as never) ? filtros.estado : undefined;

  const tickets = await obtenerDetalleTickets(eventoId, { tandaId, estado: estadoFiltro });
  const tandasActivas = evento.tandas.filter((t) => t.estado === "activa");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[15px] font-extrabold">Detalle de clientes / tickets</h2>
        <ModalCortesia tandas={tandasActivas.map((t) => ({ id: t.id, nombre: t.nombre }))} />
      </div>

      <form className="flex flex-wrap gap-3" method="get">
        <select name="tanda_id" defaultValue={tandaId ?? ""} className="eike-campo-input w-auto">
          <option value="">Todas las tandas</option>
          {evento.tandas.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nombre}
            </option>
          ))}
        </select>
        <select name="estado" defaultValue={estadoFiltro ?? ""} className="eike-campo-input w-auto">
          <option value="">Todos los estados</option>
          {Object.entries(ETIQUETA_ESTADO).map(([valor, etiqueta]) => (
            <option key={valor} value={valor}>
              {etiqueta}
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
                <th>Comprador</th>
                <th>Tanda</th>
                <th>Estado</th>
                <th>Compra</th>
              </tr>
            </thead>
            <tbody>
              {tickets.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center text-muted">
                    No hay tickets con esos filtros.
                  </td>
                </tr>
              ) : (
                tickets.map((t) => (
                  <tr key={t.id}>
                    <td className="num">{t.codigo}</td>
                    <td>{t.nombreComprador}</td>
                    <td>
                      {t.tandaNombre}
                      {t.asientoIdentificador ? ` · ${t.asientoIdentificador}` : ""}
                    </td>
                    <td>
                      <Pill variante={PILL_ESTADO_TICKET[t.estado as keyof typeof PILL_ESTADO_TICKET] ?? "neutral"}>
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
  );
}
