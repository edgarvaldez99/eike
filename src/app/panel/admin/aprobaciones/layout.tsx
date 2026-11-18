import { requerirSesion } from "@/lib/auth/guardas";
import { contarOrdenesPendientes } from "@/server/aprobaciones-admin";
import { obtenerMetricasGlobales } from "@/server/usuarios";
import { NavTabs } from "@/componentes/ui/NavTabs";

export const dynamic = "force-dynamic";

/** Aprobaciones del superadmin, separadas por tipo: compras, organizaciones y eventos. */
export default async function LayoutAprobaciones({ children }: { children: React.ReactNode }) {
  await requerirSesion(["superadmin"]);
  const [metricas, compras] = await Promise.all([obtenerMetricasGlobales(), contarOrdenesPendientes()]);
  const organizaciones = metricas.organizadoresPorEstado.pendiente_aprobacion ?? 0;
  const eventos = metricas.eventosPorEstado.pendiente_aprobacion ?? 0;
  const conContador = (etiqueta: string, n: number) => (n > 0 ? `${etiqueta} (${n})` : etiqueta);

  return (
    <div className="flex flex-col gap-5">
      <NavTabs
        etiquetaAria="Tipos de aprobación"
        items={[
          { href: "/panel/admin/aprobaciones", etiqueta: conContador("Todos", compras + organizaciones + eventos) },
          { href: "/panel/admin/aprobaciones/compras", etiqueta: conContador("Compras", compras) },
          { href: "/panel/admin/aprobaciones/organizaciones", etiqueta: conContador("Organizaciones", organizaciones) },
          { href: "/panel/admin/aprobaciones/eventos", etiqueta: conContador("Eventos", eventos) },
        ]}
      />
      {children}
    </div>
  );
}
