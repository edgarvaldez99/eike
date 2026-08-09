import Link from "next/link";
import { usuarioActual } from "@/lib/auth/sesion";
import { cerrarSesionAction } from "@/lib/acciones/auth";
import { Avatar } from "@/componentes/ui/Avatar";
import { Boton } from "@/componentes/ui/Boton";

export default async function LayoutPublico({ children }: { children: React.ReactNode }) {
  const usuario = await usuarioActual();
  const esComprador = usuario && (usuario.rol === "comprador" || usuario.rol === "superadmin");

  return (
    <div className="flex min-h-screen flex-col">
      <header className="eike-topbar">
        <div className="eike-topbar-row">
          <Link href="/" className="eike-brand">
            <div className="eike-brand-mark">e</div>
            <span className="eike-brand-word">eike</span>
          </Link>
          {esComprador ? (
            <div className="eike-user-pill">
              <Link href="/panel/mis-entradas" className="eike-btn eike-btn--ghost eike-btn--sm">
                Mis entradas
              </Link>
              <Avatar nombre={usuario.nombre} />
              <form action={cerrarSesionAction}>
                <Boton type="submit" variante="ghost" tamano="sm">
                  Salir
                </Boton>
              </form>
            </div>
          ) : (
            <div className="eike-user-pill">
              <Link href="/ingresar" className="eike-btn eike-btn--ghost eike-btn--sm">
                Ingresar
              </Link>
              <Link href="/registrarme" className="eike-btn eike-btn--cyan eike-btn--sm">
                Registrarme
              </Link>
            </div>
          )}
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1240px] flex-1 p-6">{children}</main>
      <footer className="border-t border-border-soft p-6 text-center text-[12.5px] text-muted-dim">
        ¿Sos organizador?{" "}
        <Link href="/ingresar" className="text-cyan hover:underline">
          Entrá acá
        </Link>
      </footer>
    </div>
  );
}
