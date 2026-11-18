import { Card } from "@/componentes/ui/Card";
import { AccionesPendienteEvento } from "@/componentes/admin/AccionesPendienteEvento";
import { formatoFecha } from "@/lib/formato";

export interface EventoPendiente {
  id: number;
  nombre: string;
  organizadorNombre: string;
  fechaEvento: Date;
}

/** Eventos que un organizador envió a revisión y esperan la aprobación del superadmin. */
export function TablaEventosPendientes({ eventos }: { eventos: EventoPendiente[] }) {
  return (
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
            {eventos.length === 0 ? (
              <tr>
                <td colSpan={4} className="text-center text-muted">
                  No hay eventos pendientes de aprobación.
                </td>
              </tr>
            ) : (
              eventos.map((e) => (
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
  );
}
