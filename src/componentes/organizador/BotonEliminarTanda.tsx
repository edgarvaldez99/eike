"use client";

import { useActionState } from "react";
import { eliminarTandaAction } from "@/lib/acciones/tandas";
import { BotonConConfirmacion } from "@/componentes/ui/BotonConConfirmacion";

export function BotonEliminarTanda({ tandaId }: { tandaId: number }) {
  const [estado, accion, pendiente] = useActionState(eliminarTandaAction, null);
  const idForm = `eliminar-tanda-${tandaId}`;

  return (
    <div className="flex flex-col gap-1">
      <form id={idForm} action={accion}>
        <input type="hidden" name="id" value={tandaId} />
      </form>
      {estado && !estado.ok ? <p className="eike-campo-error">{estado.error}</p> : null}
      <BotonConConfirmacion
        formId={idForm}
        variante="ghost"
        tamano="sm"
        disabled={pendiente}
        tituloModal="Eliminar tanda"
        mensaje="¿Eliminar esta tanda? Esto no se puede deshacer."
        etiquetaConfirmar="Sí, eliminar"
      >
        {pendiente ? "…" : "Eliminar"}
      </BotonConConfirmacion>
    </div>
  );
}
