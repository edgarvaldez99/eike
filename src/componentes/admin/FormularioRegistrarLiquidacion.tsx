"use client";

import { useActionState, useState } from "react";
import { crearLiquidacionAction } from "@/lib/acciones/liquidaciones";
import { Boton } from "@/componentes/ui/Boton";
import { CampoTexto } from "@/componentes/ui/CampoTexto";

export function FormularioRegistrarLiquidacion({
  organizadorId,
  pendienteSugerido,
}: {
  organizadorId: number;
  pendienteSugerido: number;
}) {
  const [abierto, setAbierto] = useState(false);
  const [estado, accion, pendiente] = useActionState(crearLiquidacionAction, null);
  const hoy = new Date().toISOString().slice(0, 10);

  if (!abierto) {
    return (
      <Boton tamano="sm" onClick={() => setAbierto(true)}>
        Registrar liquidación
      </Boton>
    );
  }

  return (
    <form
      action={accion}
      onSubmit={(e) => {
        if (!confirm("¿Confirmás que ya se le pagó esta liquidación al organizador?")) e.preventDefault();
      }}
      className="flex flex-col gap-2 rounded-[var(--radius-eike-sm)] border border-border-soft p-3"
    >
      <input type="hidden" name="organizador_id" value={organizadorId} />
      <div className="grid grid-cols-2 gap-2">
        <CampoTexto etiqueta="Período inicio" type="date" name="periodo_inicio" defaultValue={hoy} required />
        <CampoTexto etiqueta="Período fin" type="date" name="periodo_fin" defaultValue={hoy} required />
      </div>
      <CampoTexto
        etiqueta="Total vendido del período (Gs)"
        type="number"
        name="total_vendido"
        defaultValue={pendienteSugerido}
        min={0}
        required
      />
      <CampoTexto etiqueta="Comisión / suscripción a cobrar (Gs)" type="number" name="monto_comision_o_suscripcion" defaultValue={0} min={0} required />
      {estado && !estado.ok ? <p className="eike-campo-error">{estado.error}</p> : null}
      <div className="flex gap-2">
        <Boton type="submit" tamano="sm" disabled={pendiente}>
          {pendiente ? "Registrando…" : "Registrar (ya pagado)"}
        </Boton>
        <Boton type="button" variante="ghost" tamano="sm" onClick={() => setAbierto(false)}>
          Cancelar
        </Boton>
      </div>
    </form>
  );
}
