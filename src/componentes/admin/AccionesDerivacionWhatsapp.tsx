"use client";

import { useActionState } from "react";
import { resolverDerivacionAction, responderDerivacionAction } from "@/lib/acciones/whatsapp";
import { AvisoError } from "@/componentes/ui/AvisoError";
import { Boton } from "@/componentes/ui/Boton";
import { CampoTexto } from "@/componentes/ui/CampoTexto";
import { errorCampo, mensajeError } from "@/lib/estado-formulario";

/** Responder al cliente por WhatsApp (dentro de las 24 h) y marcar la derivación como resuelta. */
export function AccionesDerivacionWhatsapp({ derivacionId }: { derivacionId: number }) {
  const [estadoResponder, accionResponder, pendienteResponder] = useActionState(responderDerivacionAction, null);
  const [estadoResolver, accionResolver, pendienteResolver] = useActionState(resolverDerivacionAction, null);

  return (
    <div className="flex flex-col gap-2">
      <form action={accionResponder} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="id" value={derivacionId} />
        <div className="min-w-[220px] flex-1">
          <CampoTexto
            etiqueta="Responder por WhatsApp"
            name="texto"
            required
            maxLength={1000}
            error={errorCampo(estadoResponder, "texto")}
          />
        </div>
        <Boton type="submit" tamano="sm" disabled={pendienteResponder}>
          {pendienteResponder ? "Enviando…" : "Enviar"}
        </Boton>
      </form>
      <AvisoError mensaje={mensajeError(estadoResponder, ["texto"])} />
      <form action={accionResolver}>
        <input type="hidden" name="id" value={derivacionId} />
        <Boton type="submit" variante="ghost" tamano="sm" disabled={pendienteResolver}>
          {pendienteResolver ? "…" : "Marcar como resuelta"}
        </Boton>
      </form>
      <AvisoError mensaje={mensajeError(estadoResolver)} />
    </div>
  );
}
