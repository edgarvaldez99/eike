"use client";

import { useActionState, useState } from "react";
import { editarCorreoReenvioBancoAction } from "@/lib/acciones/cuenta";
import { Boton } from "@/componentes/ui/Boton";
import { AvisoError } from "@/componentes/ui/AvisoError";
import { CampoTexto } from "@/componentes/ui/CampoTexto";
import { errorCampo, mensajeError } from "@/lib/estado-formulario";

/**
 * Correo de la empresa al que se reenvían los avisos del banco. El buzón de
 * pagos de la plataforma solo es un pasamanos (lo lee la conciliación); el
 * banco es de la empresa y debe seguir recibiendo sus correos. Vacío = no reenviar.
 */
export function FormularioCorreoReenvioBanco({ valorActual }: { valorActual: string | null }) {
  const [estado, accion, pendiente] = useActionState(editarCorreoReenvioBancoAction, null);
  const [editando, setEditando] = useState(!valorActual);

  if (!editando && valorActual) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <code className="rounded-[var(--radius-eike-sm)] border border-border bg-surface-2 px-3 py-1.5 font-mono text-[15px]">
            {valorActual}
          </code>
          <Boton type="button" variante="ghost" tamano="sm" onClick={() => setEditando(true)}>
            Editar
          </Boton>
        </div>
        <p className="text-[12.5px] text-muted">
          Cada correo del banco que llegue al buzón de pagos se reenvía a esta dirección.
        </p>
      </div>
    );
  }

  return (
    <form action={accion} className="flex flex-col gap-4">
      <CampoTexto
        etiqueta="Correo de la empresa que recibe los avisos del banco"
        name="correo_reenvio_banco"
        type="email"
        autoComplete="off"
        spellCheck={false}
        defaultValue={valorActual ?? ""}
        error={errorCampo(estado, "correo_reenvio_banco")}
      />
      <p className="-mt-2 text-[12.5px] text-muted">Dejalo vacío para no reenviar nada.</p>
      <AvisoError mensaje={mensajeError(estado, ["correo_reenvio_banco"])} />
      <div className="flex gap-2">
        <Boton type="submit" tamano="sm" disabled={pendiente} className="w-fit">
          {pendiente ? "Guardando…" : "Guardar correo"}
        </Boton>
        {valorActual ? (
          <Boton type="button" variante="ghost" tamano="sm" onClick={() => setEditando(false)}>
            Cancelar
          </Boton>
        ) : null}
      </div>
    </form>
  );
}
