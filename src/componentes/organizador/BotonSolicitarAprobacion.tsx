"use client";

import { useActionState, useState } from "react";
import { solicitarAprobacionEventoAction } from "@/lib/acciones/eventos";
import { Boton } from "@/componentes/ui/Boton";
import { Modal } from "@/componentes/ui/Modal";

/**
 * Solicitar aprobación de un evento (pedido anti-estafa) — reemplaza al
 * viejo botón "Publicar evento". Antes de mandar la solicitud muestra un
 * disclaimer: a partir de ahí el evento queda de solo lectura hasta que el
 * superadmin lo revise. Se usa en dos lugares (pedido explícito): dentro
 * de "Evento y tandas" y al lado del chip de estado en el header del evento.
 */
export function BotonSolicitarAprobacion({
  eventoId,
  tamano,
}: {
  eventoId: number;
  tamano?: "normal" | "sm";
}) {
  const [estado, accion, pendiente] = useActionState(solicitarAprobacionEventoAction, null);
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      <Boton type="button" tamano={tamano} onClick={() => setAbierto(true)}>
        Solicitar aprobación
      </Boton>

      <Modal titulo="Solicitar aprobación del evento" abierto={abierto} onCerrar={() => setAbierto(false)}>
        <div className="flex flex-col gap-4">
          <p className="text-[13.5px] text-muted">
            Al solicitar la aprobación, <strong className="text-text">el evento queda de solo lectura</strong>:
            no vas a poder editar sus datos, subir un afiche nuevo, ni crear o modificar tandas, cupones o
            programas de referidos — nada — hasta que el superadmin lo revise.
          </p>
          <p className="text-[13.5px] text-muted">
            Si lo aprueba, queda publicado y disponible para la venta. Si lo rechaza, vas a ver el motivo acá
            mismo y el evento vuelve a ser editable para que lo corrijas y solicites de nuevo.
          </p>
          {estado && !estado.ok ? <p className="eike-campo-error">{estado.error}</p> : null}
          <form action={accion} className="flex justify-end gap-2">
            <input type="hidden" name="id" value={eventoId} />
            <Boton type="button" variante="ghost" onClick={() => setAbierto(false)}>
              Cancelar
            </Boton>
            <Boton type="submit" disabled={pendiente}>
              {pendiente ? "Enviando…" : "Sí, solicitar aprobación"}
            </Boton>
          </form>
        </div>
      </Modal>
    </>
  );
}
