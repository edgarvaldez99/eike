"use client";

import { useActionState } from "react";
import { inactivarStaffAction, reactivarStaffAction } from "@/lib/acciones/staff";
import { Boton } from "@/componentes/ui/Boton";

export function BotonEstadoStaff({ staffId, activo }: { staffId: number; activo: boolean }) {
  const accionAUsar = activo ? inactivarStaffAction : reactivarStaffAction;
  const [estado, accion, pendiente] = useActionState(accionAUsar, null);

  return (
    <form action={accion}>
      <input type="hidden" name="staff_id" value={staffId} />
      {estado && !estado.ok ? <p className="eike-campo-error">{estado.error}</p> : null}
      <Boton type="submit" variante="ghost" tamano="sm" disabled={pendiente}>
        {pendiente ? "…" : activo ? "Inactivar" : "Reactivar"}
      </Boton>
    </form>
  );
}
