"use client";

import { useState } from "react";
import { Boton } from "./Boton";
import { Modal } from "./Modal";

/**
 * Pide confirmación en un Modal estilizado antes de someter un `<form>` ya
 * existente — reemplaza el `confirm()` nativo del navegador, que Chrome/
 * Firefox muestran sin poder estilizarlo en absoluto (literalmente
 * "localhost:3000 dice ...", con la marca del navegador, no la de Eike) y
 * que además bloquea el hilo principal del browser entero, no solo la
 * pestaña.
 *
 * No es un botón de submit en sí mismo: al confirmar, dispara el submit del
 * `<form id={formId}>` correspondiente vía el atributo HTML `form` — funciona
 * aunque este botón viva afuera de ese `<form>` en el árbol (que es
 * justamente el caso acá: el modal se abre por encima de todo, el form real
 * sigue donde estaba, con su propio useActionState/errores intactos).
 */
export function BotonConConfirmacion({
  formId,
  mensaje,
  tituloModal = "Confirmar",
  etiquetaConfirmar = "Confirmar",
  variante = "cyan",
  tamano,
  disabled,
  children,
}: {
  formId: string;
  mensaje: string;
  tituloModal?: string;
  etiquetaConfirmar?: string;
  variante?: "cyan" | "ghost";
  tamano?: "normal" | "sm";
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      <Boton type="button" variante={variante} tamano={tamano} disabled={disabled} onClick={() => setAbierto(true)}>
        {children}
      </Boton>

      <Modal titulo={tituloModal} abierto={abierto} onCerrar={() => setAbierto(false)}>
        <div className="flex flex-col gap-4">
          <p className="text-[13.5px] text-muted">{mensaje}</p>
          <div className="flex justify-end gap-2">
            <Boton type="button" variante="ghost" onClick={() => setAbierto(false)}>
              Cancelar
            </Boton>
            <Boton type="submit" form={formId} onClick={() => setAbierto(false)}>
              {etiquetaConfirmar}
            </Boton>
          </div>
        </div>
      </Modal>
    </>
  );
}
