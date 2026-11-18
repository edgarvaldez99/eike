import Link from "next/link";
import { requerirSesion } from "@/lib/auth/guardas";
import { listarOrdenesPendientes } from "@/server/aprobaciones-admin";
import { listarOrganizadores } from "@/server/usuarios";
import { obtenerEventosGlobal } from "@/server/eventos";
import { ComprasPorEvento } from "@/componentes/admin/ComprasPorEvento";
import { TablaOrganizadoresPendientes } from "@/componentes/admin/TablaOrganizadoresPendientes";
import { TablaEventosPendientes } from "@/componentes/admin/TablaEventosPendientes";

export const metadata = { robots: { index: false, follow: false } };

/** "Todos": todo lo que espera una decisión del superadmin, junto en una sola vista. */
export default async function PaginaAdminAprobacionesTodos() {
  await requerirSesion(["superadmin"]);
  const [compras, organizadores, eventos] = await Promise.all([
    listarOrdenesPendientes(),
    listarOrganizadores("pendiente_aprobacion"),
    obtenerEventosGlobal(),
  ]);
  const eventosPendientes = eventos.filter((e) => e.estado === "pendiente_aprobacion");

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3" aria-labelledby="titulo-compras">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="titulo-compras" className="text-[15px] font-extrabold">
            Compras ({compras.length})
          </h2>
          <Link href="/panel/admin/aprobaciones/compras" className="text-[12.5px] text-lila-bright underline">
            Ver detalle y avisos del banco
          </Link>
        </div>
        <ComprasPorEvento ordenes={compras} conAcciones vacio="No hay compras pendientes." />
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="titulo-organizaciones">
        <h2 id="titulo-organizaciones" className="text-[15px] font-extrabold">
          Organizaciones ({organizadores.length})
        </h2>
        <TablaOrganizadoresPendientes organizadores={organizadores} />
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="titulo-eventos">
        <h2 id="titulo-eventos" className="text-[15px] font-extrabold">
          Eventos ({eventosPendientes.length})
        </h2>
        <TablaEventosPendientes eventos={eventosPendientes} />
      </section>
    </div>
  );
}
