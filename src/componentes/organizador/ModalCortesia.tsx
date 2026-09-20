"use client";

import { useActionState, useState } from "react";
import { crearCortesiaAction } from "@/lib/acciones/tickets";
import { Boton } from "@/componentes/ui/Boton";
import { AvisoError } from "@/componentes/ui/AvisoError";
import { CampoSelect } from "@/componentes/ui/CampoSelect";
import { CampoTexto } from "@/componentes/ui/CampoTexto";
import { Modal } from "@/componentes/ui/Modal";
import { errorCampo, mensajeError } from "@/lib/estado-formulario";

export interface TandaParaCortesia {
  id: number;
  nombre: string;
}

export function ModalCortesia({ tandas }: { tandas: TandaParaCortesia[] }) {
  const [abierto, setAbierto] = useState(false);
  const [estado, accion, pendiente] = useActionState(crearCortesiaAction, null);

  return (
    <>
      <Boton tamano="sm" onClick={() => setAbierto(true)}>
        + Emitir cortesía
      </Boton>
      <Modal titulo="Emitir cortesía" abierto={abierto} onCerrar={() => setAbierto(false)}>
        <form action={accion} className="flex flex-col gap-4">
          <CampoSelect etiqueta="Tanda" name="tanda_id" required>
            {tandas.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </CampoSelect>
          <CampoTexto
            etiqueta="Nombre del invitado"
            name="nombre_comprador"
            autoComplete="name"
            required
            error={errorCampo(estado, "nombre_comprador")}
          />
          <CampoTexto
            etiqueta="Cédula (opcional)"
            name="cedula"
            inputMode="numeric"
            autoComplete="off"
            spellCheck={false}
          />
          <CampoTexto
            etiqueta="Email"
            type="email"
            name="email"
            autoComplete="email"
            spellCheck={false}
            required
            error={errorCampo(estado, "email")}
          />
          <CampoTexto etiqueta="Contacto (opcional)" name="contacto" type="tel" inputMode="tel" autoComplete="tel" />
          <AvisoError mensaje={mensajeError(estado, ["nombre_comprador", "email"])} />
          <Boton type="submit" disabled={pendiente || tandas.length === 0} className="justify-center">
            {pendiente ? "Emitiendo…" : "Emitir cortesía"}
          </Boton>
          {tandas.length === 0 ? (
            <p className="text-[12px] text-muted">No hay tandas activas en este evento.</p>
          ) : null}
        </form>
      </Modal>
    </>
  );
}
