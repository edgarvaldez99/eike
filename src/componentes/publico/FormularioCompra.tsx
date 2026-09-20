"use client";

import { useActionState, useId, useState } from "react";
import { comprarTicketAction } from "@/lib/acciones/tickets-publico";
import { Boton } from "@/componentes/ui/Boton";
import { AvisoError } from "@/componentes/ui/AvisoError";
import { CampoImagen } from "@/componentes/ui/CampoImagen";
import { CampoTexto } from "@/componentes/ui/CampoTexto";
import { CampoCupon, type CuponAplicado } from "@/componentes/publico/CampoCupon";
import { cn } from "@/lib/cn";
import { errorCampo, mensajeError } from "@/lib/estado-formulario";
import type { UsuarioSesion } from "@/lib/auth/sesion";
import type { AsientoDisponible } from "@/server/tandas";
import type { TandaPublica } from "@/server/eventos";

export function FormularioCompra({
  eventoId,
  tanda,
  usuario,
  asientosDisponibles,
}: {
  eventoId: number;
  tanda: TandaPublica;
  usuario: UsuarioSesion | null;
  asientosDisponibles: AsientoDisponible[];
}) {
  const [estado, accion, pendiente] = useActionState(comprarTicketAction, null);
  const [asientoId, setAsientoId] = useState<number | null>(null);
  const [cupon, setCupon] = useState<CuponAplicado | null>(null);
  // Un cupón del 100% deja la compra gratis: no reactiva a mano, se deriva
  // siempre del total ya con descuento (nunca del precio de lista solo).
  const esGratis = tanda.precio - (cupon?.descuento ?? 0) <= 0;
  const requiereAsiento = tanda.tipo === "numerada" && usuario !== null;
  const idGrupoAsiento = useId();

  return (
    <form action={accion} encType="multipart/form-data" className="flex flex-col gap-4">
      <input type="hidden" name="evento_id" value={eventoId} />
      <input type="hidden" name="tanda_id" value={tanda.id} />
      <input type="hidden" name="codigo_cupon" value={cupon?.codigo ?? ""} />
      {asientoId ? <input type="hidden" name="asiento_id" value={asientoId} /> : null}

      {requiereAsiento ? (
        <div>
          <span id={idGrupoAsiento} className="eike-campo-label">
            Elegí tu asiento
          </span>
          {asientosDisponibles.length === 0 ? (
            <p className="text-[13px] text-muted">No quedan asientos disponibles.</p>
          ) : (
            <div role="group" aria-labelledby={idGrupoAsiento} className="flex flex-wrap gap-2">
              {asientosDisponibles.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  aria-pressed={asientoId === a.id}
                  onClick={() => setAsientoId(a.id)}
                  className={cn(
                    "eike-btn eike-btn--sm",
                    asientoId === a.id ? "eike-btn--cyan" : "eike-btn--ghost",
                  )}
                >
                  {a.identificador}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}

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

      {tanda.precio > 0 ? (
        <CampoCupon eventoId={eventoId} tandaId={tanda.id} onResultado={setCupon} />
      ) : null}

      {esGratis ? (
        <p className="text-[13px] text-green">
          {cupon ? "Con el cupón, esta entrada queda gratis — no se requiere comprobante." : "Esta entrada es gratuita — no se requiere comprobante."}
        </p>
      ) : (
        <>
          <CampoTexto
            etiqueta="Nº de comprobante (opcional)"
            name="comprobante_texto"
            autoComplete="off"
            spellCheck={false}
          />
          <CampoImagen
            etiqueta="Comprobante de pago (imagen o PDF)"
            name="comprobante"
            required
            permitirPdf
          />
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
