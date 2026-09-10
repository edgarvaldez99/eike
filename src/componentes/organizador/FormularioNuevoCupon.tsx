"use client";

import { useActionState, useState } from "react";
import { crearCuponAction } from "@/lib/acciones/cupones";
import { Boton } from "@/componentes/ui/Boton";
import { CampoMonto } from "@/componentes/ui/CampoMonto";
import { CampoTexto } from "@/componentes/ui/CampoTexto";

/** Cupones de descuento (Fase 7 del plan de mejoras). Deja los avanzados
 * (tope por comprador, monto mínimo de compra) con sus defaults del
 * servidor (1 uso por comprador, sin mínimo) — exponerlos acá sería mucho
 * formulario para el caso común. */
export function FormularioNuevoCupon({ eventoId }: { eventoId: number }) {
  const [estado, accion, pendiente] = useActionState(crearCuponAction, null);
  const [tipo, setTipo] = useState<"porcentaje" | "monto">("porcentaje");
  const [alcance, setAlcance] = useState<"evento" | "todos">("evento");
  const errorCampo = (campo: string) => (estado && !estado.ok ? estado.campos?.[campo] : undefined);

  return (
    <form action={accion} className="eike-card flex flex-col gap-4 p-4">
      {alcance === "evento" ? <input type="hidden" name="evento_id" value={eventoId} /> : null}

      <CampoTexto
        etiqueta="Código"
        name="codigo"
        required
        placeholder="VERANO2026"
        error={errorCampo("codigo")}
      />

      <div>
        <label className="eike-campo-label">Aplica a</label>
        <div className="mt-1 flex gap-4 text-[13px]">
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              checked={alcance === "evento"}
              onChange={() => setAlcance("evento")}
            />
            Solo este evento
          </label>
          <label className="flex items-center gap-1.5">
            <input type="radio" checked={alcance === "todos"} onChange={() => setAlcance("todos")} />
            Todos mis eventos
          </label>
        </div>
      </div>

      <div>
        <label className="eike-campo-label">Tipo de descuento</label>
        <div className="mt-1 flex gap-4 text-[13px]">
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="tipo"
              value="porcentaje"
              checked={tipo === "porcentaje"}
              onChange={() => setTipo("porcentaje")}
            />
            Porcentaje
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="tipo"
              value="monto"
              checked={tipo === "monto"}
              onChange={() => setTipo("monto")}
            />
            Monto fijo (Gs)
          </label>
        </div>
      </div>

      {tipo === "porcentaje" ? (
        <CampoTexto
          etiqueta="Porcentaje (1-100)"
          name="valor"
          type="number"
          min={1}
          max={100}
          required
          error={errorCampo("valor")}
        />
      ) : (
        <CampoMonto etiqueta="Monto (Gs)" name="valor" required defaultValue={0} error={errorCampo("valor")} />
      )}

      <CampoTexto etiqueta="Tope de usos (opcional)" name="max_usos" type="number" min={1} />
      <CampoTexto etiqueta="Vence el (opcional)" name="vence_en" type="date" />

      {estado && !estado.ok ? <p className="eike-campo-error">{estado.error}</p> : null}
      <Boton type="submit" disabled={pendiente} className="w-fit">
        {pendiente ? "Creando…" : "+ Nuevo cupón"}
      </Boton>
    </form>
  );
}
