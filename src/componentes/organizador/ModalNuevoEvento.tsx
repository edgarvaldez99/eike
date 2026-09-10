"use client";

import { useActionState, useState } from "react";
import { crearEventoAction } from "@/lib/acciones/eventos";
import { Boton } from "@/componentes/ui/Boton";
import { CampoMonto } from "@/componentes/ui/CampoMonto";
import { CampoTexto } from "@/componentes/ui/CampoTexto";
import { CampoTextarea } from "@/componentes/ui/CampoTextarea";
import { Modal } from "@/componentes/ui/Modal";

export function ModalNuevoEvento() {
  const [abierto, setAbierto] = useState(false);
  const [estado, accion, pendiente] = useActionState(crearEventoAction, null);
  const errorCampo = (campo: string) => (estado && !estado.ok ? estado.campos?.[campo] : undefined);

  return (
    <>
      <Boton onClick={() => setAbierto(true)}>+ Nuevo evento</Boton>
      <Modal titulo="Nuevo evento" abierto={abierto} onCerrar={() => setAbierto(false)}>
        <form action={accion} className="flex flex-col gap-4">
          <CampoTexto etiqueta="Nombre" name="nombre" required error={errorCampo("nombre")} />
          <CampoTextarea etiqueta="Descripción" name="descripcion" rows={3} />
          <CampoTexto
            etiqueta="Fecha y hora"
            type="datetime-local"
            name="fecha_evento"
            required
            error={errorCampo("fecha_evento")}
          />
          <CampoTexto etiqueta="Lugar" name="lugar" />
          <CampoMonto etiqueta="Aforo total (opcional)" name="aforo_total" />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="es_gratuito" />
            Evento gratuito (sus tandas no pueden tener precio)
          </label>
          {estado && !estado.ok && !estado.campos ? (
            <p className="eike-campo-error">{estado.error}</p>
          ) : null}
          <Boton type="submit" disabled={pendiente} className="justify-center">
            {pendiente ? "Creando…" : "Crear evento"}
          </Boton>
        </form>
      </Modal>
    </>
  );
}
