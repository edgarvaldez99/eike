import { requerirSesion } from "@/lib/auth/guardas";
import { resumenTodosLosOrganizadores } from "@/server/liquidaciones";
import { Card } from "@/componentes/ui/Card";
import { formatoGs } from "@/lib/formato";
import { FormularioRegistrarLiquidacion } from "@/componentes/admin/FormularioRegistrarLiquidacion";

export const metadata = { robots: { index: false, follow: false } };

export default async function PaginaAdminLiquidaciones() {
  await requerirSesion(["superadmin"]);
  const organizadores = await resumenTodosLosOrganizadores();

  return (
    <div>
      <h2 className="mb-3 text-[15px] font-extrabold">Retiros / liquidaciones por organizador</h2>
      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="eike-tabla">
            <thead>
              <tr>
                <th>Organizador</th>
                <th className="right">Ingresos confirmados</th>
                <th className="right">Ya retirado</th>
                <th className="right">Pendiente de retiro</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {organizadores.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center text-muted">
                    Todavía no hay organizadores.
                  </td>
                </tr>
              ) : (
                organizadores.map((o) => (
                  <tr key={o.organizadorId}>
                    <td>{o.nombre}</td>
                    <td className="num right">{formatoGs(o.ingresosConfirmados)}</td>
                    <td className="num right">{formatoGs(o.retirado)}</td>
                    <td className="num right">{formatoGs(o.pendiente)}</td>
                    <td>
                      <FormularioRegistrarLiquidacion organizadorId={o.organizadorId} pendienteSugerido={o.pendiente} />
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
