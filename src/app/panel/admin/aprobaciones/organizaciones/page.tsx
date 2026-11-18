import { requerirSesion } from "@/lib/auth/guardas";
import { listarOrganizadores } from "@/server/usuarios";
import { TablaOrganizadoresPendientes } from "@/componentes/admin/TablaOrganizadoresPendientes";

export const metadata = { robots: { index: false, follow: false } };

export default async function PaginaAprobacionesOrganizaciones() {
  await requerirSesion(["superadmin"]);
  const organizadores = await listarOrganizadores("pendiente_aprobacion");

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="text-[15px] font-extrabold">Organizaciones pendientes ({organizadores.length})</h2>
        <p className="text-[12.5px] text-muted">
          Organizadores que se registraron y todavía no pueden publicar eventos hasta que los apruebes.
        </p>
      </div>
      <TablaOrganizadoresPendientes organizadores={organizadores} />
    </div>
  );
}
