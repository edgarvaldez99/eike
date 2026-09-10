"use client";

import { useActionState } from "react";
import { cambiarEstadoProgramaAction } from "@/lib/acciones/referidos";
import { Boton } from "@/componentes/ui/Boton";

export function BotonVisibilidadPrograma({ programaId, activo }: { programaId: number; activo: boolean }) {
  const [resultado, accion, pendiente] = useActionState(cambiarEstadoProgramaAction, null);

  return (
    <form action={accion} className="flex flex-col items-end gap-1">
      <input type="hidden" name="id" value={programaId} />
      <input type="hidden" name="activo" value={activo ? "false" : "true"} />
      {resultado && !resultado.ok ? <p className="eike-campo-error text-right">{resultado.error}</p> : null}
      <Boton type="submit" variante="ghost" tamano="sm" disabled={pendiente}>
        {pendiente ? "…" : activo ? "Desactivar" : "Activar"}
      </Boton>
    </form>
  );
}
