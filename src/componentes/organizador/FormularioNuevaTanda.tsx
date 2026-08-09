"use client";

import { useActionState, useState } from "react";
import { crearTandaAction } from "@/lib/acciones/tandas";
import { Boton } from "@/componentes/ui/Boton";
import { CampoTexto } from "@/componentes/ui/CampoTexto";
import { CampoTextarea } from "@/componentes/ui/CampoTextarea";

export function FormularioNuevaTanda({ eventoId }: { eventoId: number }) {
  const [estado, accion, pendiente] = useActionState(crearTandaAction, null);
  const [tipo, setTipo] = useState<"general" | "numerada">("general");
  const [modoAsientos, setModoAsientos] = useState<"grilla" | "lista">("grilla");
  const errorCampo = (campo: string) => (estado && !estado.ok ? estado.campos?.[campo] : undefined);

  return (
    <form action={accion} className="eike-card flex flex-col gap-4 p-4">
      <input type="hidden" name="evento_id" value={eventoId} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <CampoTexto etiqueta="Nombre" name="nombre" required error={errorCampo("nombre")} />
        <CampoTexto etiqueta="Precio (Gs)" type="number" min={0} name="precio" required defaultValue={0} />
      </div>

      <div>
        <label className="eike-campo-label">Tipo</label>
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="tipo"
              value="general"
              checked={tipo === "general"}
              onChange={() => setTipo("general")}
            />
            General (solo cupo)
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="tipo"
              value="numerada"
              checked={tipo === "numerada"}
              onChange={() => setTipo("numerada")}
            />
            Numerada (con asientos)
          </label>
        </div>
      </div>

      {tipo === "general" ? (
        <CampoTexto
          etiqueta="Cantidad total"
          type="number"
          min={1}
          name="cantidad_total"
          required
          error={errorCampo("cantidad_total")}
        />
      ) : (
        <div className="flex flex-col gap-3 rounded-[var(--radius-eike-sm)] border border-border-soft p-3">
          <div>
            <label className="eike-campo-label">Cómo cargar el mapa de asientos</label>
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  name="modo_asientos"
                  value="grilla"
                  checked={modoAsientos === "grilla"}
                  onChange={() => setModoAsientos("grilla")}
                />
                Grilla (filas × columnas)
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  name="modo_asientos"
                  value="lista"
                  checked={modoAsientos === "lista"}
                  onChange={() => setModoAsientos("lista")}
                />
                Lista de nombres
              </label>
            </div>
          </div>
          {modoAsientos === "grilla" ? (
            <div className="grid grid-cols-2 gap-4">
              <CampoTexto etiqueta="Filas" type="number" min={1} name="filas" error={errorCampo("filas")} />
              <CampoTexto
                etiqueta="Asientos por fila"
                type="number"
                min={1}
                name="asientos_por_fila"
                error={errorCampo("asientos_por_fila")}
              />
            </div>
          ) : (
            <CampoTextarea
              etiqueta="Identificadores (separados por coma o salto de línea)"
              name="identificadores"
              rows={3}
              placeholder="VIP-1, VIP-2, VIP-3…"
            />
          )}
        </div>
      )}

      {estado && !estado.ok ? <p className="eike-campo-error">{estado.error}</p> : null}
      <Boton type="submit" disabled={pendiente} className="w-fit">
        {pendiente ? "Creando…" : "+ Nueva tanda"}
      </Boton>
    </form>
  );
}
