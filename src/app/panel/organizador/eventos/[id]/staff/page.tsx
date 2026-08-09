import { notFound } from "next/navigation";
import { requerirSesion } from "@/lib/auth/guardas";
import { obtenerEventoConTandas } from "@/server/eventos";
import { listarStaff } from "@/server/staff";
import { Card } from "@/componentes/ui/Card";
import { Pill } from "@/componentes/ui/Pill";
import { PILL_ESTADO_USUARIO } from "@/lib/estilosEstado";
import { FormularioInvitarStaff } from "@/componentes/organizador/FormularioInvitarStaff";
import { BotonEstadoStaff } from "@/componentes/organizador/BotonEstadoStaff";

export const metadata = { robots: { index: false, follow: false } };

const ETIQUETA_ESTADO: Record<string, string> = {
  activo: "Activo",
  inactivo: "Inactivo",
  pendiente_aprobacion: "Pendiente",
  rechazado: "Rechazado",
  mora: "Mora",
};

export default async function PaginaStaff({ params }: { params: Promise<{ id: string }> }) {
  const usuario = await requerirSesion(["organizador", "superadmin"]);
  const { id } = await params;
  const eventoId = Number(id);
  const evento = await obtenerEventoConTandas(eventoId);
  if (!evento) notFound();

  const staff = await listarStaff(usuario, eventoId);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[15px] font-extrabold">Staff de este evento</h2>
          <p className="text-[12.5px] text-muted">Acceso solo al escáner de puerta, sin datos financieros.</p>
        </div>
        <FormularioInvitarStaff eventoId={eventoId} origenSitio={process.env.SITE_URL ?? ""} />
      </div>
      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="eike-tabla">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Email</th>
                <th>Eventos asignados</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {staff.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center text-muted">
                    Todavía no invitaste a nadie.
                  </td>
                </tr>
              ) : (
                staff.map((s) => (
                  <tr key={s.id}>
                    <td>{s.nombre}</td>
                    <td className="text-muted">{s.email}</td>
                    <td className="text-muted">{s.eventosAsignados}</td>
                    <td>
                      <Pill variante={PILL_ESTADO_USUARIO[s.estado as keyof typeof PILL_ESTADO_USUARIO] ?? "neutral"}>
                        {ETIQUETA_ESTADO[s.estado] ?? s.estado}
                      </Pill>
                    </td>
                    <td>
                      <BotonEstadoStaff staffId={s.id} activo={s.estado === "activo"} />
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
