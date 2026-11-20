"use client";

import { useActionState } from "react";
import { asignarComprobanteAction } from "@/lib/acciones/whatsapp";
import { AvisoError } from "@/componentes/ui/AvisoError";
import { Boton } from "@/componentes/ui/Boton";
import { CampoTexto } from "@/componentes/ui/CampoTexto";
import { errorCampo, mensajeError } from "@/lib/estado-formulario";

/** Ata un comprobante recibido por WhatsApp a la compra cuyo código escribe el superadmin. */
export function FormularioAsignarComprobante({ comprobanteId }: { comprobanteId: number }) {
  const [estado, accion, pendiente] = useActionState(asignarComprobanteAction, null);
  return (
    <div className="flex flex-col gap-1">
      <form action={accion} className="flex items-end gap-2">
        <input type="hidden" name="id" value={comprobanteId} />
        <CampoTexto
          etiqueta="Código de la compra"
          name="codigo"
          required
          placeholder="ORD-…"
          error={errorCampo(estado, "codigo")}
        />
        <Boton type="submit" tamano="sm" disabled={pendiente}>
          {pendiente ? "…" : "Asignar"}
        </Boton>
      </form>
      <AvisoError mensaje={mensajeError(estado, ["codigo"])} />
    </div>
  );
}
