import Link from "next/link";
import { usuarioActual } from "@/lib/auth/sesion";
import { cerrarSesionAction } from "@/lib/acciones/auth";
import { leerTokenCarrito } from "@/lib/carrito/cookie";
import { contarUnidadesCarrito, obtenerCarritoUtilizablePorToken } from "@/server/carrito";
import { Avatar } from "@/componentes/ui/Avatar";
import { Boton } from "@/componentes/ui/Boton";

export default async function LayoutPublico({ children }: { children: React.ReactNode }) {
  const usuario = await usuarioActual();
  const esComprador = usuario && (usuario.rol === "comprador" || usuario.rol === "superadmin");

  // Fase 6 del plan de mejoras — indicador de carrito. Esta capa ya lee la
  // cookie de sesión (usuarioActual, arriba) así que agregar esta segunda
  // lectura de cookie no le suma ningún costo de caché nuevo.
  const carrito = await obtenerCarritoUtilizablePorToken(await leerTokenCarrito());
  const unidadesCarrito = carrito ? await contarUnidadesCarrito(carrito.id) : 0;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="eike-topbar">
        <div className="eike-topbar-row">
          <Link href="/" className="eike-brand">
            <div className="eike-brand-mark">e</div>
            <span className="eike-brand-word">eike</span>
          </Link>
          <div className="eike-user-pill">
            <Link href="/carrito" className="eike-btn eike-btn--ghost eike-btn--sm">
              🛒 Carrito{unidadesCarrito > 0 ? ` (${unidadesCarrito})` : ""}
            </Link>
            {usuario ? (
              <>
                <Link
                  href={esComprador ? "/panel/mis-entradas" : "/panel"}
                  className="eike-btn eike-btn--ghost eike-btn--sm"
                >
                  {esComprador ? "Mis entradas" : "Ir a mi panel"}
                </Link>
                <Avatar nombre={usuario.nombre} />
                <form action={cerrarSesionAction}>
                  <Boton type="submit" variante="ghost" tamano="sm">
                    Salir
                  </Boton>
                </form>
              </>
            ) : (
              <>
                <Link href="/ingresar" className="eike-btn eike-btn--ghost eike-btn--sm">
                  Ingresar
                </Link>
                <Link href="/registrarme" className="eike-btn eike-btn--cyan eike-btn--sm">
                  Registrarme
                </Link>
              </>
            )}
          </div>
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
