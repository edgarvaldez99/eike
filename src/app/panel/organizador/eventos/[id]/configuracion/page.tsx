import { notFound } from "next/navigation";
import { requerirSesion } from "@/lib/auth/guardas";
import { obtenerEventoConTandas } from "@/server/eventos";
import { Card } from "@/componentes/ui/Card";
import { Pill } from "@/componentes/ui/Pill";
import { PILL_ESTADO_TANDA } from "@/lib/estilosEstado";
import { formatoGs } from "@/lib/formato";
import { FormularioDatosEvento } from "@/componentes/organizador/FormularioDatosEvento";
import { FormularioAfiche } from "@/componentes/organizador/FormularioAfiche";
import { FormularioNuevaTanda } from "@/componentes/organizador/FormularioNuevaTanda";
import { BotonEliminarTanda } from "@/componentes/organizador/BotonEliminarTanda";

export const metadata = { robots: { index: false, follow: false } };

const ETIQUETA_TIPO_TANDA: Record<string, string> = { general: "General", numerada: "Numerada" };
const ETIQUETA_ESTADO_TANDA: Record<string, string> = { activa: "Activa", agotada: "Agotada", inactiva: "Inactiva" };

export default async function PaginaConfiguracionEvento({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requerirSesion(["organizador", "superadmin"]);
  const { id } = await params;
  const evento = await obtenerEventoConTandas(Number(id));
  if (!evento) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="mb-3 text-[15px] font-extrabold">Datos del evento</h2>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_200px]">
          <Card>
            <FormularioDatosEvento evento={evento} />
          </Card>
          <Card>
            <FormularioAfiche eventoId={evento.id} aficheUrl={evento.aficheUrl} />
          </Card>
        </div>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] font-extrabold">Tandas</h2>
        </div>
        <Card className="mb-4 p-0">
          <div className="overflow-x-auto">
            <table className="eike-tabla">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Tipo</th>
                  <th className="right">Precio</th>
                  <th className="right">Vendidas / Total</th>
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {evento.tandas.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center text-muted">
                      Todavía no creaste ninguna tanda.
                    </td>
                  </tr>
                ) : (
                  evento.tandas.map((tanda) => (
                    <tr key={tanda.id}>
                      <td>{tanda.nombre}</td>
                      <td className="text-muted">{ETIQUETA_TIPO_TANDA[tanda.tipo]}</td>
                      <td className="num right">{formatoGs(tanda.precio)}</td>
                      <td className="num right">
                        {tanda.cantidadVendida} / {tanda.cantidadTotal}
                      </td>
                      <td>
                        <Pill variante={PILL_ESTADO_TANDA[tanda.estado]}>
                          {ETIQUETA_ESTADO_TANDA[tanda.estado]}
                        </Pill>
                      </td>
                      <td>
                        <BotonEliminarTanda tandaId={tanda.id} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
        <FormularioNuevaTanda eventoId={evento.id} />
      </div>
    </div>
  );
}
