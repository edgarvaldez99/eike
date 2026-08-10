"use client";

import { useActionState, useState } from "react";
import { aprobarOrganizadorAction, rechazarOrganizadorAction } from "@/lib/acciones/admin-usuarios";
import { Boton } from "@/componentes/ui/Boton";
import { CampoTexto } from "@/componentes/ui/CampoTexto";
import { Modal } from "@/componentes/ui/Modal";

export function AccionesPendienteOrganizador({ organizadorId }: { organizadorId: number }) {
  const [estadoAprobar, accionAprobar, pendienteAprobar] = useActionState(aprobarOrganizadorAction, null);
  const [estadoRechazar, accionRechazar, pendienteRechazar] = useActionState(rechazarOrganizadorAction, null);
  const [abierto, setAbierto] = useState(false);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-2">
        <form
          action={accionAprobar}
          onSubmit={(e) => {
            if (!confirm("¿Aprobar este organizador?")) e.preventDefault();
          }}
        >
          <input type="hidden" name="id" value={organizadorId} />
          <Boton type="submit" tamano="sm" disabled={pendienteAprobar}>
            {pendienteAprobar ? "…" : "Aprobar"}
          </Boton>
        </form>
        <Boton type="button" variante="ghost" tamano="sm" onClick={() => setAbierto(true)}>
          Rechazar
        </Boton>
      </div>
      {estadoAprobar && !estadoAprobar.ok ? <p className="eike-campo-error">{estadoAprobar.error}</p> : null}

      <Modal titulo="Rechazar organizador" abierto={abierto} onCerrar={() => setAbierto(false)}>
        <form action={accionRechazar} className="flex flex-col gap-4">
          <input type="hidden" name="id" value={organizadorId} />
          <CampoTexto
            etiqueta="Motivo (se le informará al organizador)"
            name="motivo"
            required
            error={estadoRechazar && !estadoRechazar.ok ? estadoRechazar.campos?.motivo : undefined}
          />
          {estadoRechazar && !estadoRechazar.ok && !estadoRechazar.campos ? (
            <p className="eike-campo-error">{estadoRechazar.error}</p>
          ) : null}
          <Boton type="submit" disabled={pendienteRechazar} className="justify-center">
            {pendienteRechazar ? "Rechazando…" : "Rechazar"}
          </Boton>
        </form>
      </Modal>
    </div>
  );
}
