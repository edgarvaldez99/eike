import { requerirSesion } from "@/lib/auth/guardas";
import { obtenerEventosGlobal } from "@/server/eventos";
import { TablaEventosPendientes } from "@/componentes/admin/TablaEventosPendientes";

export const metadata = { robots: { index: false, follow: false } };

export default async function PaginaAprobacionesEventos() {
  await requerirSesion(["superadmin"]);
  const eventos = await obtenerEventosGlobal();
  const pendientes = eventos.filter((e) => e.estado === "pendiente_aprobacion");

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="text-[15px] font-extrabold">Eventos pendientes ({pendientes.length})</h2>
        <p className="text-[12.5px] text-muted">Eventos que un organizador envió a revisión antes de salir a la venta.</p>
      </div>
      <TablaEventosPendientes eventos={pendientes} />
    </div>
  );
}
