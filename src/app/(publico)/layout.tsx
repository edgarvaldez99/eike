import Image from "next/image";
import Link from "next/link";
import logoMarca from "@/app/logo-eike.png";
import { usuarioActual } from "@/lib/auth/sesion";
import { cerrarSesionAction } from "@/lib/acciones/auth";
import { leerTokenCarrito } from "@/lib/carrito/cookie";
import { contarUnidadesCarrito, obtenerCarritoUtilizablePorToken } from "@/server/carrito";
import { Avatar } from "@/componentes/ui/Avatar";
import { Boton } from "@/componentes/ui/Boton";
import { Icono } from "@/componentes/ui/Icono";
import { SkipLink } from "@/componentes/ui/SkipLink";
import { SwitcherTema } from "@/componentes/ui/SwitcherTema";

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
      <SkipLink destino="#contenido-principal" />
      <header className="eike-topbar">
        <div className="eike-topbar-row">
          <Link href="/" className="eike-brand">
            <Image src={logoMarca} alt="eike e-ticket" className="eike-logo-marca eike-logo-marca--topbar" priority />
          </Link>
          <div className="eike-user-pill">
            <SwitcherTema />
            <Link href="/carrito" className="eike-btn eike-btn--ghost eike-btn--sm">
              <Icono nombre="carrito" />
              Carrito{unidadesCarrito > 0 ? ` (${unidadesCarrito})` : ""}
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
                <Link href="/ingresar" className="eike-btn eike-btn--amarillo eike-btn--sm">
                  Ingresar
                </Link>
                <Link href="/registrarme" className="eike-btn eike-btn--lila eike-btn--sm">
                  Registrarme
                </Link>
              </>
            )}
          </div>
        </div>
      </header>
      <div aria-hidden="true" className="eike-full-bleed eike-glow-fondo" />
      <main id="contenido-principal" className="mx-auto w-full max-w-[1264px] flex-1 p-6">
        {children}
      </main>
      <footer className="eike-safe-bottom border-t border-border-soft">
        <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-8 p-6 sm:flex-row sm:justify-between">
          <Image src={logoMarca} alt="eike e-ticket" className="eike-logo-marca h-auto w-[150px]" />

          <div className="flex flex-col gap-1.5 text-[13px]">
            <span className="eike-eyebrow">Nosotros</span>
            <Link href="/sobre-nosotros" className="text-muted hover:text-text">
              Sobre nosotros
            </Link>
            <Link href="/preguntas-frecuentes" className="text-muted hover:text-text">
              Preguntas frecuentes
            </Link>
          </div>

          <div className="flex flex-col gap-1.5 text-[13px]">
            <span className="eike-eyebrow">Términos</span>
            <Link href="/terminos" className="text-muted hover:text-text">
              Términos y condiciones
            </Link>
            <Link href="/privacidad" className="text-muted hover:text-text">
              Política de privacidad
            </Link>
          </div>

          <div className="flex flex-col gap-3">
            <a href="mailto:info@eike.com.py" className="text-[13px] text-muted hover:text-text">
              info@eike.com.py
            </a>
            <div className="flex gap-2">
              <a href="#" aria-label="Eike en Facebook" className="eike-footer-social">
                <Icono nombre="facebook" />
              </a>
              <a href="#" aria-label="Eike en X" className="eike-footer-social">
                <Icono nombre="x" />
              </a>
              <a href="#" aria-label="Eike en Instagram" className="eike-footer-social">
                <Icono nombre="instagram" />
              </a>
            </div>
            <p className="text-[12px] text-muted-dim">eike Copyright 2026. Todos los derechos reservados</p>
          </div>
        </div>
        <div className="border-t border-border-soft p-4 text-center text-[12.5px] text-muted-dim">
          ¿Sos organizador?{" "}
          <Link href="/ingresar" className="text-lila-bright underline">
            Entrá acá
          </Link>
        </div>
      </footer>
    </div>
  );
}
