"use client";

import { useActionState, useState } from "react";
import { crearLiquidacionAction } from "@/lib/acciones/liquidaciones";
import { Boton } from "@/componentes/ui/Boton";
import { BotonConConfirmacion } from "@/componentes/ui/BotonConConfirmacion";
import { CampoMonto } from "@/componentes/ui/CampoMonto";
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
  const idForm = `registrar-liquidacion-${organizadorId}`;

  if (!abierto) {
    return (
      <Boton tamano="sm" onClick={() => setAbierto(true)}>
        Registrar liquidación
      </Boton>
    );
  }

  return (
    <form id={idForm} action={accion} className="flex flex-col gap-2 rounded-[var(--radius-eike-sm)] border border-border-soft p-3">
      <input type="hidden" name="organizador_id" value={organizadorId} />
      <div className="grid grid-cols-2 gap-2">
        <CampoTexto etiqueta="Período inicio" type="date" name="periodo_inicio" defaultValue={hoy} required />
        <CampoTexto etiqueta="Período fin" type="date" name="periodo_fin" defaultValue={hoy} required />
      </div>
      <CampoMonto
        etiqueta="Total vendido del período (Gs)"
        name="total_vendido"
        defaultValue={pendienteSugerido}
        required
      />
      <CampoMonto etiqueta="Comisión / suscripción a cobrar (Gs)" name="monto_comision_o_suscripcion" defaultValue={0} required />
      {estado && !estado.ok ? <p className="eike-campo-error">{estado.error}</p> : null}
      <div className="flex gap-2">
        <BotonConConfirmacion
          formId={idForm}
          tamano="sm"
          disabled={pendiente}
          tituloModal="Registrar liquidación"
          mensaje="¿Confirmás que ya se le pagó esta liquidación al organizador?"
          etiquetaConfirmar="Sí, ya se pagó"
        >
          {pendiente ? "Registrando…" : "Registrar (ya pagado)"}
        </BotonConConfirmacion>
        <Boton type="button" variante="ghost" tamano="sm" onClick={() => setAbierto(false)}>
          Cancelar
        </Boton>
      </div>
    </form>
  );
}
