"use client";

import { useActionState } from "react";
import Image from "next/image";
import { subirAficheAction } from "@/lib/acciones/upload";
import { Boton } from "@/componentes/ui/Boton";
import { CampoImagen } from "@/componentes/ui/CampoImagen";

export function FormularioAfiche({
  eventoId,
  aficheUrl,
  puedeEditar = true,
}: {
  eventoId: number;
  aficheUrl: string | null;
  /** Aprobación de eventos (anti-estafa): fuera de 'borrador'/'rechazado' el
   * evento es de solo lectura — ni el servidor lo va a aceptar (ver
   * subirAficheAction), así que acá directamente no se muestra el input. */
  puedeEditar?: boolean;
}) {
  const [estado, accion, pendiente] = useActionState(subirAficheAction, null);

  const imagen = aficheUrl ? (
    <Image
      src={aficheUrl}
      alt="Afiche del evento"
      width={200}
      height={280}
      className="rounded-[var(--radius-eike-sm)] border border-border object-cover"
      unoptimized
    />
  ) : (
    <div className="flex h-[140px] w-[100px] items-center justify-center rounded-[var(--radius-eike-sm)] border border-dashed border-border text-center text-[11px] text-muted-dim">
      Sin afiche
    </div>
  );

  if (!puedeEditar) {
    return <div className="flex flex-col gap-3">{imagen}</div>;
  }

  return (
    <form action={accion} className="flex flex-col gap-3">
      <input type="hidden" name="evento_id" value={eventoId} />
      {imagen}
      <CampoImagen etiqueta="Nueva imagen" name="afiche" required />
      {estado && !estado.ok ? <p className="eike-campo-error">{estado.error}</p> : null}
      <Boton type="submit" variante="ghost" tamano="sm" disabled={pendiente} className="w-fit">
        {pendiente ? "Subiendo…" : "Subir afiche"}
      </Boton>
    </form>
  );
}
