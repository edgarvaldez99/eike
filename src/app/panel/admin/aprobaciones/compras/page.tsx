import { requerirSesion } from "@/lib/auth/guardas";
import {
  listarAvisosBancoSinOrden,
  listarOrdenesPendientes,
  listarOrdenesResueltas,
} from "@/server/aprobaciones-admin";
import { obtenerNumeroWhatsappPlataforma } from "@/server/cuenta";
import { Card } from "@/componentes/ui/Card";
import { ComprasPorEvento } from "@/componentes/admin/ComprasPorEvento";
import { formatoFecha, formatoGs } from "@/lib/formato";

export const metadata = { robots: { index: false, follow: false } };

export default async function PaginaAprobacionesCompras() {
  await requerirSesion(["superadmin"]);
  const [pendientes, resueltas, avisos, numeroPlataforma] = await Promise.all([
    listarOrdenesPendientes(),
    listarOrdenesResueltas(),
    listarAvisosBancoSinOrden(),
    obtenerNumeroWhatsappPlataforma(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-[15px] font-extrabold">Aprobación manual de compras</h2>
        <p className="text-[12.5px] text-muted">
          Verificación a mano mientras Meta no verifica el negocio: compará el comprobante con tu banco y
          aprobá o rechazá.
          {numeroPlataforma ? (
            <>
              {" "}
              Los compradores te mandan el comprobante al <strong>{numeroPlataforma}</strong>.
            </>
          ) : (
            " Todavía no cargaste el número de WhatsApp de la plataforma (Mi cuenta)."
          )}
        </p>
      </div>

      <section className="flex flex-col gap-3" aria-labelledby="titulo-pendientes">
        <h3 id="titulo-pendientes" className="text-[14px] font-extrabold">
          Pendientes ({pendientes.length})
        </h3>
        <ComprasPorEvento ordenes={pendientes} conAcciones abiertos vacio="No hay compras pendientes." />
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="titulo-avisos">
        <div>
          <h3 id="titulo-avisos" className="text-[14px] font-extrabold">
            Avisos del banco sin cruzar
          </h3>
          <p className="text-[12.5px] text-muted">
            Transferencias que llegaron por correo y no se atan a ninguna compra: sirven para cotejar el monto.
          </p>
        </div>
        <Card className="p-0">
          <div className="overflow-x-auto">
            <table className="eike-tabla">
              <thead>
                <tr>
                  <th>Recibido</th>
                  <th>Banco</th>
                  <th>Pagador</th>
                  <th>Operación</th>
                  <th className="right">Monto</th>
                </tr>
              </thead>
              <tbody>
                {avisos.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center text-muted">
                      No hay avisos sin cruzar.
                    </td>
                  </tr>
                ) : (
                  avisos.map((a) => (
                    <tr key={a.id}>
                      <td className="num">{formatoFecha(a.recibidoEn)}</td>
                      <td>{a.banco ?? "—"}</td>
                      <td>{a.pagador ?? "—"}</td>
                      <td className="num text-muted">{a.operacion ?? "—"}</td>
                      <td className="num right">{a.monto === null ? "—" : formatoGs(a.monto)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="titulo-resueltas">
        <h3 id="titulo-resueltas" className="text-[14px] font-extrabold">
          Resueltas recientemente
        </h3>
        <ComprasPorEvento ordenes={resueltas} vacio="Todavía no se resolvió ninguna compra." />
      </section>
    </div>
  );
}
