"use client";

import { useActionState } from "react";
import { cambiarEstadoTandaAction } from "@/lib/acciones/tandas";
import { Boton } from "@/componentes/ui/Boton";
import { AvisoError } from "@/componentes/ui/AvisoError";
import { mensajeError } from "@/lib/estado-formulario";
import type { EstadoTanda } from "@/lib/constantes";

/** Toggle activa/inactiva. Una tanda "agotada" no se puede reactivar a mano
 * (lo gestiona el sistema solo, ver server/tickets.ts) pero sí se puede
 * ocultar mientras espera stock nuevo. */
export function BotonVisibilidadTanda({ tandaId, estado }: { tandaId: number; estado: EstadoTanda }) {
  const [resultado, accion, pendiente] = useActionState(cambiarEstadoTandaAction, null);
  const oculta = estado === "inactiva";
  const proximoEstado = oculta ? "activa" : "inactiva";

  return (
    <form action={accion} className="flex flex-col items-end gap-1">
      <input type="hidden" name="id" value={tandaId} />
      <input type="hidden" name="estado" value={proximoEstado} />
      <AvisoError mensaje={mensajeError(resultado)} className="text-right" />
      <Boton type="submit" variante="ghost" tamano="sm" disabled={pendiente}>
        {pendiente ? "…" : oculta ? "Mostrar" : "Ocultar"}
      </Boton>
    </form>
  );
}
