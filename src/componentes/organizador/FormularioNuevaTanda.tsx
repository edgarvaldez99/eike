"use client";

import { useActionState, useState } from "react";
import { crearTandaAction } from "@/lib/acciones/tandas";
import { Boton } from "@/componentes/ui/Boton";
import { AvisoError } from "@/componentes/ui/AvisoError";
import { CampoMonto } from "@/componentes/ui/CampoMonto";
import { CampoTexto } from "@/componentes/ui/CampoTexto";
import { CampoTextarea } from "@/componentes/ui/CampoTextarea";
import { GrupoOpciones } from "@/componentes/ui/GrupoOpciones";
import { errorCampo, mensajeError } from "@/lib/estado-formulario";

export function FormularioNuevaTanda({ eventoId }: { eventoId: number }) {
  const [estado, accion, pendiente] = useActionState(crearTandaAction, null);
  const [tipo, setTipo] = useState<"general" | "numerada">("general");
  const [modoAsientos, setModoAsientos] = useState<"grilla" | "lista">("grilla");

  return (
    <form action={accion} className="eike-card flex flex-col gap-4 p-4">
      <input type="hidden" name="evento_id" value={eventoId} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <CampoTexto etiqueta="Nombre" name="nombre" required error={errorCampo(estado, "nombre")} />
        <CampoMonto etiqueta="Precio (Gs)" name="precio" required defaultValue={0} />
      </div>

      <GrupoOpciones etiqueta="Tipo">
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
      </GrupoOpciones>

      {tipo === "general" ? (
        <CampoMonto
          etiqueta="Cantidad total"
          name="cantidad_total"
          required
          error={errorCampo(estado, "cantidad_total")}
        />
      ) : (
        <div className="flex flex-col gap-3 rounded-[var(--radius-eike-sm)] border border-border-soft p-3">
          <GrupoOpciones etiqueta="Cómo cargar el mapa de asientos">
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
          </GrupoOpciones>
          {modoAsientos === "grilla" ? (
            <div className="grid grid-cols-2 gap-4">
              <CampoTexto
                etiqueta="Filas"
                type="number"
                min={1}
                name="filas"
                error={errorCampo(estado, "filas")}
              />
              <CampoTexto
                etiqueta="Asientos por fila"
                type="number"
                min={1}
                name="asientos_por_fila"
                error={errorCampo(estado, "asientos_por_fila")}
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

      <AvisoError mensaje={mensajeError(estado, ["nombre", "cantidad_total", "filas", "asientos_por_fila"])} />
      <Boton type="submit" disabled={pendiente} className="w-fit">
        {pendiente ? "Creando…" : "+ Nueva tanda"}
      </Boton>
    </form>
  );
}
