"use client";

import { useActionState } from "react";
import { inactivarStaffAction, reactivarStaffAction } from "@/lib/acciones/staff";
import { Boton } from "@/componentes/ui/Boton";
import { AvisoError } from "@/componentes/ui/AvisoError";
import { mensajeError } from "@/lib/estado-formulario";

export function BotonEstadoStaff({ staffId, activo }: { staffId: number; activo: boolean }) {
  const accionAUsar = activo ? inactivarStaffAction : reactivarStaffAction;
  const [estado, accion, pendiente] = useActionState(accionAUsar, null);

  return (
    <form action={accion}>
      <input type="hidden" name="staff_id" value={staffId} />
      <AvisoError mensaje={mensajeError(estado)} />
      <Boton type="submit" variante="ghost" tamano="sm" disabled={pendiente}>
        {pendiente ? "…" : activo ? "Inactivar" : "Reactivar"}
      </Boton>
    </form>
  );
}
