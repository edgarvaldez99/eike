"use client";

import { useActionState } from "react";
import { eliminarTandaAction } from "@/lib/acciones/tandas";
import { BotonConConfirmacion } from "@/componentes/ui/BotonConConfirmacion";
import { AvisoError } from "@/componentes/ui/AvisoError";
import { mensajeError } from "@/lib/estado-formulario";

export function BotonEliminarTanda({ tandaId }: { tandaId: number }) {
  const [estado, accion, pendiente] = useActionState(eliminarTandaAction, null);
  const idForm = `eliminar-tanda-${tandaId}`;

  return (
    <div className="flex flex-col gap-1">
      <form id={idForm} action={accion}>
        <input type="hidden" name="id" value={tandaId} />
      </form>
      <AvisoError mensaje={mensajeError(estado)} />
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
