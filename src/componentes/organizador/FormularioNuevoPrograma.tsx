"use client";

import { useActionState, useState } from "react";
import { crearProgramaAction } from "@/lib/acciones/referidos";
import { Boton } from "@/componentes/ui/Boton";
import { CampoTexto } from "@/componentes/ui/CampoTexto";

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
  const errorCampo = (campo: string) => (estado && !estado.ok ? estado.campos?.[campo] : undefined);

  return (
    <form action={accion} className="eike-card flex flex-col gap-4 p-4">
      {alcance === "evento" ? <input type="hidden" name="evento_id" value={eventoId} /> : null}

      <CampoTexto etiqueta="Nombre del programa" name="nombre" required placeholder="Embajadores" error={errorCampo("nombre")} />

      <div>
        <label className="eike-campo-label">Aplica a</label>
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
      </div>

      <CampoTexto
        etiqueta="Ventas referidas por premio"
        name="ventas_requeridas"
        type="number"
        min={1}
        required
        defaultValue={5}
        error={errorCampo("ventas_requeridas")}
      />

      <div>
        <label className="eike-campo-label">Premio: cortesía de</label>
        <select name="tanda_premio_id" required className="eike-campo-input" disabled={tandas.length === 0}>
          {tandas.length === 0 ? (
            <option value="">Creá una tanda primero</option>
          ) : (
            tandas.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))
          )}
        </select>
        {errorCampo("tanda_premio_id") ? <p className="eike-campo-error">{errorCampo("tanda_premio_id")}</p> : null}
      </div>

      {estado && !estado.ok ? <p className="eike-campo-error">{estado.error}</p> : null}
      <Boton type="submit" disabled={pendiente || tandas.length === 0} className="w-fit">
        {pendiente ? "Creando…" : "+ Nuevo programa"}
      </Boton>
    </form>
  );
}
