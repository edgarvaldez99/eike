import { requerirSesion } from "@/lib/auth/guardas";
import { cerrarSesionAction } from "@/lib/acciones/auth";
import { Avatar } from "@/componentes/ui/Avatar";
import { Boton } from "@/componentes/ui/Boton";
import { NavTabs } from "@/componentes/ui/NavTabs";

export const dynamic = "force-dynamic";

const ETIQUETAS_ROL: Record<string, string> = {
  superadmin: "Superadmin",
  organizador: "Organizador",
  staff: "Staff",
  comprador: "Comprador",
};

export default async function LayoutPanel({ children }: { children: React.ReactNode }) {
  // Sin restricción de rol acá: cada subárbol del panel (organizador, admin,
  // escáner) exige su propio rol en su layout — ver Fases 4/6/7.
  const usuario = await requerirSesion();

  return (
    <div className="min-h-screen">
      <header className="eike-topbar">
        <div className="eike-topbar-row">
          <div className="eike-brand">
            <div className="eike-brand-mark">e</div>
            <span className="eike-brand-word">eike</span>
          </div>
          <div className="eike-user-pill">
            <div className="text-right">
              <div className="eike-user-name">{usuario.nombre}</div>
              <div className="eike-user-role">{ETIQUETAS_ROL[usuario.rol] ?? usuario.rol}</div>
            </div>
            <Avatar nombre={usuario.nombre} />
            <form action={cerrarSesionAction}>
              <Boton type="submit" variante="ghost" tamano="sm">
                Salir
              </Boton>
            </form>
          </div>
        </div>
        <NavTabs
          items={[
            { href: "/panel", etiqueta: "Resumen" },
            { href: "/panel/cuenta", etiqueta: "Cuenta" },
          ]}
        />
      </header>
      <main className="mx-auto max-w-[1240px] p-6">{children}</main>
    </div>
  );
}
