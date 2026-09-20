"use client";

import { useActionState, useState } from "react";
import { crearProgramaAction } from "@/lib/acciones/referidos";
import { Boton } from "@/componentes/ui/Boton";
import { AvisoError } from "@/componentes/ui/AvisoError";
import { CampoSelect } from "@/componentes/ui/CampoSelect";
import { CampoTexto } from "@/componentes/ui/CampoTexto";
import { GrupoOpciones } from "@/componentes/ui/GrupoOpciones";
import { errorCampo, mensajeError } from "@/lib/estado-formulario";

/** Premios por compartir (Fase 8 del plan de mejoras): "cada N ventas
 * referidas, 1 cortesía de la tanda elegida acá". Deja los avanzados (tope
 * de premios por usuario, monto mínimo de venta) con sus defaults del
 * servidor (sin tope, ₲1 mínimo) — mismo criterio que FormularioNuevoCupon. */
export function FormularioNuevoPrograma({
  eventoId,
  tandas,
}: {
  eventoId: number;
  tandas: { id: number; nombre: string }[];
}) {
  const [estado, accion, pendiente] = useActionState(crearProgramaAction, null);
  const [alcance, setAlcance] = useState<"evento" | "todos">("evento");

  return (
    <form action={accion} className="eike-card flex flex-col gap-4 p-4">
      {alcance === "evento" ? <input type="hidden" name="evento_id" value={eventoId} /> : null}

      <CampoTexto
        etiqueta="Nombre del programa"
        name="nombre"
        required
        placeholder="Embajadores"
        error={errorCampo(estado, "nombre")}
      />

      <GrupoOpciones etiqueta="Aplica a">
        <div className="mt-1 flex gap-4 text-[13px]">
          <label className="flex items-center gap-1.5">
            <input type="radio" checked={alcance === "evento"} onChange={() => setAlcance("evento")} />
            Solo este evento
          </label>
          <label className="flex items-center gap-1.5">
            <input type="radio" checked={alcance === "todos"} onChange={() => setAlcance("todos")} />
            Todos mis eventos
          </label>
        </div>
      </GrupoOpciones>

      <CampoTexto
        etiqueta="Ventas referidas por premio"
        name="ventas_requeridas"
        type="number"
        min={1}
        required
        defaultValue={5}
        error={errorCampo(estado, "ventas_requeridas")}
      />

      <CampoSelect
        etiqueta="Premio: cortesía de"
        name="tanda_premio_id"
        required
        disabled={tandas.length === 0}
        error={errorCampo(estado, "tanda_premio_id")}
      >
        {tandas.length === 0 ? (
          <option value="">Creá una tanda primero</option>
        ) : (
          tandas.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nombre}
            </option>
          ))
        )}
      </CampoSelect>

      <AvisoError mensaje={mensajeError(estado, ["nombre", "ventas_requeridas", "tanda_premio_id"])} />
      <Boton type="submit" disabled={pendiente || tandas.length === 0} className="w-fit">
        {pendiente ? "Creando…" : "+ Nuevo programa"}
      </Boton>
    </form>
  );
}
