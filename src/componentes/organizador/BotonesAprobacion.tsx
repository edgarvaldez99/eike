"use client";

import { useActionState } from "react";
import { aprobarTicketAction, rechazarTicketAction } from "@/lib/acciones/tickets";
import { Boton } from "@/componentes/ui/Boton";

export function BotonesAprobacion({ ticketId }: { ticketId: number }) {
  const [estadoAprobar, accionAprobar, pendienteAprobar] = useActionState(aprobarTicketAction, null);
  const [estadoRechazar, accionRechazar, pendienteRechazar] = useActionState(rechazarTicketAction, null);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-2">
        <form action={accionAprobar}>
          <input type="hidden" name="id" value={ticketId} />
          <Boton type="submit" tamano="sm" disabled={pendienteAprobar || pendienteRechazar}>
            {pendienteAprobar ? "…" : "Aprobar"}
          </Boton>
        </form>
        <form
          action={accionRechazar}
          onSubmit={(e) => {
            if (!confirm("¿Rechazar esta compra? Se libera el stock/asiento.")) e.preventDefault();
          }}
        >
          <input type="hidden" name="id" value={ticketId} />
          <Boton type="submit" variante="ghost" tamano="sm" disabled={pendienteAprobar || pendienteRechazar}>
            {pendienteRechazar ? "…" : "Rechazar"}
          </Boton>
        </form>
      </div>
      {estadoAprobar && !estadoAprobar.ok ? <p className="eike-campo-error">{estadoAprobar.error}</p> : null}
      {estadoRechazar && !estadoRechazar.ok ? <p className="eike-campo-error">{estadoRechazar.error}</p> : null}
    </div>
  );
}
