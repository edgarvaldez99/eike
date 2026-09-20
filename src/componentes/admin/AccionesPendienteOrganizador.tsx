"use client";

import { useActionState, useState } from "react";
import { aprobarOrganizadorAction, rechazarOrganizadorAction } from "@/lib/acciones/admin-usuarios";
import { Boton } from "@/componentes/ui/Boton";
import { BotonConConfirmacion } from "@/componentes/ui/BotonConConfirmacion";
import { AvisoError } from "@/componentes/ui/AvisoError";
import { CampoTexto } from "@/componentes/ui/CampoTexto";
import { Modal } from "@/componentes/ui/Modal";
import { errorCampo, mensajeError } from "@/lib/estado-formulario";

export function AccionesPendienteOrganizador({ organizadorId }: { organizadorId: number }) {
  const [estadoAprobar, accionAprobar, pendienteAprobar] = useActionState(aprobarOrganizadorAction, null);
  const [estadoRechazar, accionRechazar, pendienteRechazar] = useActionState(rechazarOrganizadorAction, null);
  const [abierto, setAbierto] = useState(false);
  const idFormAprobar = `aprobar-organizador-${organizadorId}`;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-2">
        <form id={idFormAprobar} action={accionAprobar}>
          <input type="hidden" name="id" value={organizadorId} />
        </form>
        <BotonConConfirmacion
          formId={idFormAprobar}
          tamano="sm"
          disabled={pendienteAprobar}
          tituloModal="Aprobar organizador"
          mensaje="¿Aprobar este organizador?"
          etiquetaConfirmar="Sí, aprobar"
        >
          {pendienteAprobar ? "…" : "Aprobar"}
        </BotonConConfirmacion>
        <Boton type="button" variante="ghost" tamano="sm" onClick={() => setAbierto(true)}>
          Rechazar
        </Boton>
      </div>
      <AvisoError mensaje={mensajeError(estadoAprobar)} />

      <Modal titulo="Rechazar organizador" abierto={abierto} onCerrar={() => setAbierto(false)}>
        <form action={accionRechazar} className="flex flex-col gap-4">
          <input type="hidden" name="id" value={organizadorId} />
          <CampoTexto
            etiqueta="Motivo (se le informará al organizador)"
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
