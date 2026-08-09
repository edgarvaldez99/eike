"use client";

import { useActionState } from "react";
import Image from "next/image";
import { subirAficheAction } from "@/lib/acciones/upload";
import { Boton } from "@/componentes/ui/Boton";

export function FormularioAfiche({ eventoId, aficheUrl }: { eventoId: number; aficheUrl: string | null }) {
  const [estado, accion, pendiente] = useActionState(subirAficheAction, null);

  return (
    <form action={accion} className="flex flex-col gap-3">
      <input type="hidden" name="evento_id" value={eventoId} />
      {aficheUrl ? (
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
      )}
      <input
        type="file"
        name="afiche"
        accept="image/jpeg,image/png,image/webp"
        required
        className="text-[12.5px]"
      />
      {estado && !estado.ok ? <p className="eike-campo-error">{estado.error}</p> : null}
      <Boton type="submit" variante="ghost" tamano="sm" disabled={pendiente} className="w-fit">
        {pendiente ? "Subiendo…" : "Subir afiche"}
      </Boton>
    </form>
  );
}
