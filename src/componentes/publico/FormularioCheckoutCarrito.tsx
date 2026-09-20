"use client";

import { useActionState, useState } from "react";
import { checkoutCarritoAction } from "@/lib/acciones/carrito";
import { Boton } from "@/componentes/ui/Boton";
import { AvisoError } from "@/componentes/ui/AvisoError";
import { CampoImagen } from "@/componentes/ui/CampoImagen";
import { CampoTexto } from "@/componentes/ui/CampoTexto";
import { CampoCuponCarrito, type CuponCarritoAplicado } from "@/componentes/publico/CampoCuponCarrito";
import { formatoGs } from "@/lib/formato";
import { errorCampo, mensajeError } from "@/lib/estado-formulario";
import type { UsuarioSesion } from "@/lib/auth/sesion";

/**
 * Checkout del carrito (Fase 6 del plan de mejoras) — puerto de
 * FormularioCompra, generalizado a varios ítems. Ya no elige asiento acá
 * (eso pasó al carrito → checkout, ver esquema.ts::carritoItems): el
 * asiento de una tanda numerada se asigna dentro de checkoutCarrito.
 */
export function FormularioCheckoutCarrito({
  subtotal,
  usuario,
}: {
  subtotal: number;
  usuario: UsuarioSesion | null;
}) {
  const [estado, accion, pendiente] = useActionState(checkoutCarritoAction, null);
  const [cupon, setCupon] = useState<CuponCarritoAplicado | null>(null);
  const total = cupon ? cupon.total : subtotal;
  const esGratis = total <= 0;

  return (
    <form action={accion} encType="multipart/form-data" className="flex flex-col gap-4">
      <input type="hidden" name="codigo_cupon" value={cupon?.codigo ?? ""} />

      <CampoTexto
        etiqueta="Nombre completo"
        name="nombre_comprador"
        autoComplete="name"
        required
        defaultValue={usuario?.nombre ?? ""}
        error={errorCampo(estado, "nombre_comprador")}
      />
      <CampoTexto
        etiqueta="Cédula"
        name="cedula"
        inputMode="numeric"
        autoComplete="off"
        spellCheck={false}
        defaultValue={usuario?.cedula ?? ""}
      />
      <CampoTexto
        etiqueta="Email"
        type="email"
        name="email"
        autoComplete="email"
        spellCheck={false}
        required
        defaultValue={usuario?.email ?? ""}
        error={errorCampo(estado, "email")}
      />
      <CampoTexto
        etiqueta="Teléfono / WhatsApp"
        name="contacto"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        defaultValue={usuario?.telefono ?? ""}
      />

      {subtotal > 0 ? <CampoCuponCarrito onResultado={setCupon} /> : null}

      <div className="flex items-center justify-between border-t border-border-soft pt-3 text-[15px] font-extrabold">
        <span>Total</span>
        <span>{esGratis ? "Gratis" : formatoGs(total)}</span>
      </div>

      {esGratis ? (
        <p className="text-[13px] text-green">
          {cupon ? "Con el cupón, tu carrito queda gratis — no se requiere comprobante." : "Tu carrito es gratuito — no se requiere comprobante."}
        </p>
      ) : (
        <>
          <CampoTexto
            etiqueta="Nº de comprobante (opcional)"
            name="comprobante_texto"
            autoComplete="off"
            spellCheck={false}
          />
          <CampoImagen etiqueta="Comprobante de pago (imagen o PDF)" name="comprobante" required permitirPdf />
        </>
      )}

      {!usuario ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="tyc_aceptado" required />
          Acepto los Términos y Condiciones / Política de Privacidad
        </label>
      ) : null}

      <AvisoError mensaje={mensajeError(estado, ["nombre_comprador", "email"])} />

      <Boton type="submit" disabled={pendiente} className="justify-center">
        {pendiente ? "Procesando…" : "Confirmar compra"}
      </Boton>
    </form>
  );
}
