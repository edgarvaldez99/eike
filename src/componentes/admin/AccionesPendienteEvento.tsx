"use client";

import { useActionState, useState } from "react";
import { aprobarEventoAction, rechazarEventoAction } from "@/lib/acciones/eventos";
import { Boton } from "@/componentes/ui/Boton";
import { BotonConConfirmacion } from "@/componentes/ui/BotonConConfirmacion";
import { AvisoError } from "@/componentes/ui/AvisoError";
import { CampoTexto } from "@/componentes/ui/CampoTexto";
import { Modal } from "@/componentes/ui/Modal";
import { errorCampo, mensajeError } from "@/lib/estado-formulario";

/** Mismo patrón que AccionesPendienteOrganizador.tsx, para eventos
 * pendientes de aprobación (pedido anti-estafa). */
export function AccionesPendienteEvento({ eventoId }: { eventoId: number }) {
  const [estadoAprobar, accionAprobar, pendienteAprobar] = useActionState(aprobarEventoAction, null);
  const [estadoRechazar, accionRechazar, pendienteRechazar] = useActionState(rechazarEventoAction, null);
  const [abierto, setAbierto] = useState(false);
  const idFormAprobar = `aprobar-evento-${eventoId}`;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-2">
        <form id={idFormAprobar} action={accionAprobar}>
          <input type="hidden" name="id" value={eventoId} />
        </form>
        <BotonConConfirmacion
          formId={idFormAprobar}
          tamano="sm"
          disabled={pendienteAprobar}
          tituloModal="Aprobar evento"
          mensaje="¿Aprobar este evento? Queda publicado y disponible para la venta."
          etiquetaConfirmar="Sí, aprobar"
        >
          {pendienteAprobar ? "…" : "Aprobar"}
        </BotonConConfirmacion>
        <Boton type="button" variante="ghost" tamano="sm" onClick={() => setAbierto(true)}>
          Rechazar
        </Boton>
      </div>
      <AvisoError mensaje={mensajeError(estadoAprobar)} />

      <Modal titulo="Rechazar evento" abierto={abierto} onCerrar={() => setAbierto(false)}>
        <form action={accionRechazar} className="flex flex-col gap-4">
          <input type="hidden" name="id" value={eventoId} />
          <CampoTexto
            etiqueta="Motivo (se le va a mostrar al organizador)"
            name="motivo"
            required
            error={errorCampo(estadoRechazar, "motivo")}
          />
          <AvisoError mensaje={mensajeError(estadoRechazar, ["motivo"])} />
          <Boton type="submit" disabled={pendienteRechazar} className="justify-center">
            {pendienteRechazar ? "Rechazando…" : "Rechazar"}
          </Boton>
        </form>
      </Modal>
    </div>
  );
}
