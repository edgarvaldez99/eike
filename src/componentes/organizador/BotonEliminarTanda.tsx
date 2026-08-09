"use client";

import { useActionState } from "react";
import { eliminarTandaAction } from "@/lib/acciones/tandas";
import { Boton } from "@/componentes/ui/Boton";

export function BotonEliminarTanda({ tandaId }: { tandaId: number }) {
  const [estado, accion, pendiente] = useActionState(eliminarTandaAction, null);

  return (
    <form
      action={accion}
      onSubmit={(e) => {
        if (!confirm("¿Eliminar esta tanda? Esto no se puede deshacer.")) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={tandaId} />
      {estado && !estado.ok ? <p className="eike-campo-error">{estado.error}</p> : null}
      <Boton type="submit" variante="ghost" tamano="sm" disabled={pendiente}>
        {pendiente ? "…" : "Eliminar"}
      </Boton>
    </form>
  );
}
