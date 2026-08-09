"use client";

import { useActionState, useState } from "react";
import { comprarTicketAction } from "@/lib/acciones/tickets-publico";
import { Boton } from "@/componentes/ui/Boton";
import { CampoTexto } from "@/componentes/ui/CampoTexto";
import { cn } from "@/lib/cn";
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
  const esGratis = tanda.precio === 0;
  const requiereAsiento = tanda.tipo === "numerada" && usuario !== null;
  const errorCampo = (campo: string) => (estado && !estado.ok ? estado.campos?.[campo] : undefined);

  return (
    <form action={accion} encType="multipart/form-data" className="flex flex-col gap-4">
      <input type="hidden" name="evento_id" value={eventoId} />
      <input type="hidden" name="tanda_id" value={tanda.id} />
      {asientoId ? <input type="hidden" name="asiento_id" value={asientoId} /> : null}

      {requiereAsiento ? (
        <div>
          <label className="eike-campo-label">Elegí tu asiento</label>
          {asientosDisponibles.length === 0 ? (
            <p className="text-[13px] text-muted">No quedan asientos disponibles.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {asientosDisponibles.map((a) => (
                <button
                  key={a.id}
                  type="button"
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
        required
        defaultValue={usuario?.nombre ?? ""}
        error={errorCampo("nombre_comprador")}
      />
      <CampoTexto etiqueta="Cédula" name="cedula" defaultValue={usuario?.cedula ?? ""} />
      <CampoTexto
        etiqueta="Email"
        type="email"
        name="email"
        required
        defaultValue={usuario?.email ?? ""}
        error={errorCampo("email")}
      />
      <CampoTexto
        etiqueta="Teléfono / WhatsApp"
        name="contacto"
        defaultValue={usuario?.telefono ?? ""}
      />

      {esGratis ? (
        <p className="text-[13px] text-green">Esta entrada es gratuita — no se requiere comprobante.</p>
      ) : (
        <>
          <CampoTexto etiqueta="Nº de comprobante (opcional)" name="comprobante_texto" />
          <div>
            <label className="eike-campo-label">Comprobante de pago (imagen o PDF)</label>
            <input
              type="file"
              name="comprobante"
              accept="image/png,image/jpeg,image/webp,application/pdf"
              required
              className="text-[12.5px]"
            />
          </div>
        </>
      )}

      {!usuario ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="tyc_aceptado" required />
          Acepto los Términos y Condiciones / Política de Privacidad
        </label>
      ) : null}

      {estado && !estado.ok && !estado.campos ? <p className="eike-campo-error">{estado.error}</p> : null}

      <Boton
        type="submit"
        disabled={pendiente || (requiereAsiento && asientosDisponibles.length > 0 && !asientoId)}
        className="justify-center"
      >
        {pendiente ? "Procesando…" : "Confirmar compra"}
      </Boton>
    </form>
  );
}
