import { notFound } from "next/navigation";
import { requerirSesion } from "@/lib/auth/guardas";
import { obtenerEventoConTandas } from "@/server/eventos";
import { obtenerPendientes } from "@/server/tickets";
import { Card } from "@/componentes/ui/Card";
import { formatoFecha, formatoGs } from "@/lib/formato";
import { BotonesAprobacion } from "@/componentes/organizador/BotonesAprobacion";

export const metadata = { robots: { index: false, follow: false } };

export default async function PaginaAprobaciones({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const usuario = await requerirSesion(["organizador", "superadmin"]);
  const { id } = await params;
  const eventoId = Number(id);
  const evento = await obtenerEventoConTandas(eventoId);
  if (!evento) notFound();

  const pendientes = await obtenerPendientes(usuario, eventoId);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-[15px] font-extrabold">Compras pendientes de aprobación</h2>
        <p className="text-[12.5px] text-muted">
          Comprobantes que todavía no se confirmaron automáticamente.
        </p>
      </div>
      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="eike-tabla">
            <thead>
              <tr>
                <th>Comprador</th>
                <th>Cédula</th>
                <th>Tanda</th>
                <th className="right">Precio</th>
                <th>Comprado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {pendientes.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center text-muted">
                    No hay compras pendientes.
                  </td>
                </tr>
              ) : (
                pendientes.map((t) => (
                  <tr key={t.id}>
                    <td>{t.nombreComprador}</td>
                    <td className="num text-muted">{t.cedula ?? "—"}</td>
                    <td>{t.tandaNombre}</td>
                    <td className="num right">{formatoGs(t.precio)}</td>
                    <td className="num">{formatoFecha(t.fechaCompra)}</td>
                    <td>
                      <div className="flex flex-col items-start gap-2">
                        <a
                          href={`/api/comprobantes/${t.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[12.5px] text-cyan hover:underline"
                        >
                          Ver comprobante ↗
                        </a>
                        <BotonesAprobacion ticketId={t.id} />
                      </div>
                    </td>
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
