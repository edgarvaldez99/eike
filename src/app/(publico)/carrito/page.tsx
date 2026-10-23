import Link from "next/link";
import type { Metadata } from "next";
import { leerTokenCarrito } from "@/lib/carrito/cookie";
import { obtenerCarritoUtilizablePorToken, obtenerResumenCarrito } from "@/server/carrito";
import { usuarioActual } from "@/lib/auth/sesion";
import { Card } from "@/componentes/ui/Card";
import { Icono } from "@/componentes/ui/Icono";
import { formatoGs } from "@/lib/formato";
import { FilaCarrito } from "@/componentes/publico/FilaCarrito";
import { ContadorCarrito } from "@/componentes/publico/ContadorCarrito";
import { FormularioCheckoutCarrito } from "@/componentes/publico/FormularioCheckoutCarrito";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function PaginaCarrito() {
  const token = await leerTokenCarrito();
  const carrito = await obtenerCarritoUtilizablePorToken(token);
  const resumen = carrito ? await obtenerResumenCarrito(carrito.id) : null;
  const usuario = await usuarioActual();
  const compradorSesion = usuario && (usuario.rol === "comprador" || usuario.rol === "superadmin") ? usuario : null;

  if (!resumen || resumen.items.length === 0) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-4 py-16 text-center">
        <Icono nombre="carrito" className="text-4xl" />
        <h1 className="text-xl font-extrabold">Tu carrito está vacío</h1>
        <p className="text-[13px] text-muted">Elegí un evento y agregá las entradas que quieras comprar.</p>
        <Link href="/eventos" className="eike-btn eike-btn--amarillo">
          Ver eventos
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-[720px] flex-col gap-4">
      <Link href="/" className="flex w-fit items-center gap-1.5 text-[14px] text-muted hover:text-text">
        <span aria-hidden="true">←</span> Volver a eventos
      </Link>
      <div>
        <span className="eike-eyebrow">Completar datos</span>
        <h1 className="mt-1 text-[28px] font-bold tracking-[-0.02em] sm:text-4xl">Entradas seleccionadas</h1>
        {resumen.segundosRestantes !== null ? (
          <ContadorCarrito key={resumen.segundosRestantes} segundosIniciales={resumen.segundosRestantes} />
        ) : null}
      </div>

      <div className="flex flex-col gap-3">
        {resumen.items.map((item) => (
          <FilaCarrito key={item.tandaId} item={item} />
        ))}
        <div className="flex items-center justify-between px-1 font-semibold">
          <span>Subtotal</span>
          <span>{formatoGs(resumen.subtotal)}</span>
        </div>
      </div>

      <Card className="border-2 border-lila sm:p-8">
        <FormularioCheckoutCarrito subtotal={resumen.subtotal} usuario={compradorSesion} />
      </Card>
    </div>
  );
}
