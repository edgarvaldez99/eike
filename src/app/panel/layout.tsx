import Link from "next/link";
import { requerirSesion } from "@/lib/auth/guardas";
import { cerrarSesionAction } from "@/lib/acciones/auth";
import { Avatar } from "@/componentes/ui/Avatar";
import { Boton } from "@/componentes/ui/Boton";

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
  const esComprador = usuario.rol === "comprador" || usuario.rol === "superadmin";

  return (
    <div className="min-h-screen">
      <header className="eike-topbar">
        <div className="eike-topbar-row">
          <Link href="/" className="eike-brand">
            <div className="eike-brand-mark">e</div>
            <span className="eike-brand-word">eike</span>
          </Link>
          <div className="eike-user-pill">
            {esComprador ? (
              <Link href="/eventos" className="eike-btn eike-btn--ghost eike-btn--sm">
                Ver eventos
              </Link>
            ) : null}
            {usuario.rol === "superadmin" ? (
              <Link href="/panel/admin" className="eike-btn eike-btn--ghost eike-btn--sm">
                Panel admin
              </Link>
            ) : null}
            <Link href="/panel/cuenta" className="flex items-center gap-2.5">
              <div className="text-right">
                <div className="eike-user-name">{usuario.nombre}</div>
                <div className="eike-user-role">{ETIQUETAS_ROL[usuario.rol] ?? usuario.rol}</div>
              </div>
              <Avatar nombre={usuario.nombre} />
            </Link>
            <form action={cerrarSesionAction}>
              <Boton type="submit" variante="ghost" tamano="sm">
                Salir
              </Boton>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1240px] p-6">{children}</main>
    </div>
  );
}
