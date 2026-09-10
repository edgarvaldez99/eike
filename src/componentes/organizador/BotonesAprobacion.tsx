"use client";

import { useActionState } from "react";
import { aprobarOrdenAction, rechazarOrdenAction } from "@/lib/acciones/tickets";
import { Boton } from "@/componentes/ui/Boton";
import { BotonConConfirmacion } from "@/componentes/ui/BotonConConfirmacion";

export function BotonesAprobacion({ ordenId }: { ordenId: number }) {
  const [estadoAprobar, accionAprobar, pendienteAprobar] = useActionState(aprobarOrdenAction, null);
  const [estadoRechazar, accionRechazar, pendienteRechazar] = useActionState(rechazarOrdenAction, null);
  const idFormRechazar = `rechazar-orden-${ordenId}`;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-2">
        <form action={accionAprobar}>
          <input type="hidden" name="id" value={ordenId} />
          <Boton type="submit" tamano="sm" disabled={pendienteAprobar || pendienteRechazar}>
            {pendienteAprobar ? "…" : "Aprobar"}
          </Boton>
        </form>
        <form id={idFormRechazar} action={accionRechazar}>
          <input type="hidden" name="id" value={ordenId} />
        </form>
        <BotonConConfirmacion
          formId={idFormRechazar}
          variante="ghost"
          tamano="sm"
          disabled={pendienteAprobar || pendienteRechazar}
          tituloModal="Rechazar compra"
          mensaje="¿Rechazar esta compra? Se libera el stock/asiento."
          etiquetaConfirmar="Sí, rechazar"
        >
          {pendienteRechazar ? "…" : "Rechazar"}
        </BotonConConfirmacion>
      </div>
      {estadoAprobar && !estadoAprobar.ok ? <p className="eike-campo-error">{estadoAprobar.error}</p> : null}
      {estadoRechazar && !estadoRechazar.ok ? <p className="eike-campo-error">{estadoRechazar.error}</p> : null}
    </div>
  );
}
