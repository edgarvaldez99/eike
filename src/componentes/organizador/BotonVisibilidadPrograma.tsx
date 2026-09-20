"use client";

import { useActionState } from "react";
import { cambiarEstadoProgramaAction } from "@/lib/acciones/referidos";
import { Boton } from "@/componentes/ui/Boton";
import { AvisoError } from "@/componentes/ui/AvisoError";
import { mensajeError } from "@/lib/estado-formulario";

export function BotonVisibilidadPrograma({ programaId, activo }: { programaId: number; activo: boolean }) {
  const [resultado, accion, pendiente] = useActionState(cambiarEstadoProgramaAction, null);

  return (
    <form action={accion} className="flex flex-col items-end gap-1">
      <input type="hidden" name="id" value={programaId} />
      <input type="hidden" name="activo" value={activo ? "false" : "true"} />
      <AvisoError mensaje={mensajeError(resultado)} className="text-right" />
      <Boton type="submit" variante="ghost" tamano="sm" disabled={pendiente}>
        {pendiente ? "…" : activo ? "Desactivar" : "Activar"}
      </Boton>
    </form>
  );
}
