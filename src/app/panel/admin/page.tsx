import { requerirSesion } from "@/lib/auth/guardas";
import { listarOrganizadores } from "@/server/usuarios";
import { Card } from "@/componentes/ui/Card";
import { Pill } from "@/componentes/ui/Pill";
import { PILL_ESTADO_USUARIO } from "@/lib/estilosEstado";
import { formatoFecha } from "@/lib/formato";
import { AccionesPendienteOrganizador } from "@/componentes/admin/AccionesPendienteOrganizador";
import { FormularioEditarOrganizador } from "@/componentes/admin/FormularioEditarOrganizador";

export const metadata = { robots: { index: false, follow: false } };

const ETIQUETA_ESTADO: Record<string, string> = {
  pendiente_aprobacion: "Pendiente",
  rechazado: "Rechazado",
  activo: "Activo",
  inactivo: "Inactivo",
  mora: "Mora",
};

export default async function PaginaAdminOrganizadores() {
  await requerirSesion(["superadmin"]);
  const organizadores = await listarOrganizadores();
  const pendientes = organizadores.filter((o) => o.estado === "pendiente_aprobacion");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="mb-3 text-[15px] font-extrabold">Pendientes de aprobación</h2>
        <Card className="p-0">
          <div className="overflow-x-auto">
            <table className="eike-tabla">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Email</th>
                  <th>Teléfono</th>
                  <th>RUC</th>
                  <th>Registrado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {pendientes.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center text-muted">
                      No hay organizadores pendientes.
                    </td>
                  </tr>
                ) : (
                  pendientes.map((o) => (
                    <tr key={o.id}>
                      <td>{o.nombre}</td>
                      <td className="text-muted">{o.email}</td>
                      <td className="text-muted">{o.telefono ?? "—"}</td>
                      <td className="text-muted">{o.rucFacturacion ?? "—"}</td>
                      <td className="num">{formatoFecha(o.creadoEn)}</td>
                      <td>
                        <AccionesPendienteOrganizador organizadorId={o.id} />
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
        <h2 className="mb-3 text-[15px] font-extrabold">Todos los organizadores</h2>
        <Card className="p-0">
          <div className="overflow-x-auto">
            <table className="eike-tabla">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Email</th>
                  <th>Estado</th>
                  <th>Teléfono</th>
                  <th>RUC</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {organizadores.map((o) => (
                  <tr key={o.id}>
                    <td>{o.nombre}</td>
                    <td className="text-muted">{o.email}</td>
                    <td>
                      <div className="flex flex-col gap-1">
                        <Pill variante={PILL_ESTADO_USUARIO[o.estado]}>{ETIQUETA_ESTADO[o.estado]}</Pill>
                        {o.estado === "rechazado" && o.motivoRechazo ? (
                          <span className="text-[11px] text-muted-dim">Motivo: {o.motivoRechazo}</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="text-muted">{o.telefono ?? "—"}</td>
                    <td className="text-muted">{o.rucFacturacion ?? "—"}</td>
                    <td>
                      <FormularioEditarOrganizador
                        organizador={{
                          id: o.id,
                          nombre: o.nombre,
                          telefono: o.telefono,
                          rucFacturacion: o.rucFacturacion,
                          estado: o.estado,
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
