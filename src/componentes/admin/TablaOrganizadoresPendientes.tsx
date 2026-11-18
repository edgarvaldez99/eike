import { Card } from "@/componentes/ui/Card";
import { AccionesPendienteOrganizador } from "@/componentes/admin/AccionesPendienteOrganizador";
import { formatoFecha } from "@/lib/formato";

export interface OrganizadorPendiente {
  id: number;
  nombre: string;
  email: string;
  telefono: string | null;
  rucFacturacion: string | null;
  creadoEn: Date;
}

/** Organizadores que se registraron y esperan la aprobación del superadmin. */
export function TablaOrganizadoresPendientes({ organizadores }: { organizadores: OrganizadorPendiente[] }) {
  return (
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
            {organizadores.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center text-muted">
                  No hay organizadores pendientes.
                </td>
              </tr>
            ) : (
              organizadores.map((o) => (
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
  );
}
