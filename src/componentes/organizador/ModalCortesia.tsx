"use client";

import { useActionState, useState } from "react";
import { crearCortesiaAction } from "@/lib/acciones/tickets";
import { Boton } from "@/componentes/ui/Boton";
import { CampoTexto } from "@/componentes/ui/CampoTexto";
import { Modal } from "@/componentes/ui/Modal";

export interface TandaParaCortesia {
  id: number;
  nombre: string;
}

export function ModalCortesia({ tandas }: { tandas: TandaParaCortesia[] }) {
  const [abierto, setAbierto] = useState(false);
  const [estado, accion, pendiente] = useActionState(crearCortesiaAction, null);
  const errorCampo = (campo: string) => (estado && !estado.ok ? estado.campos?.[campo] : undefined);

  return (
    <>
      <Boton tamano="sm" onClick={() => setAbierto(true)}>
        + Emitir cortesía
      </Boton>
      <Modal titulo="Emitir cortesía" abierto={abierto} onCerrar={() => setAbierto(false)}>
        <form action={accion} className="flex flex-col gap-4">
          <div>
            <label className="eike-campo-label" htmlFor="cortesia_tanda">
              Tanda
            </label>
            <select id="cortesia_tanda" name="tanda_id" className="eike-campo-input" required>
              {tandas.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}
                </option>
              ))}
            </select>
          </div>
          <CampoTexto
            etiqueta="Nombre del invitado"
            name="nombre_comprador"
            required
            error={errorCampo("nombre_comprador")}
          />
          <CampoTexto etiqueta="Cédula (opcional)" name="cedula" />
          <CampoTexto etiqueta="Email" type="email" name="email" required error={errorCampo("email")} />
          <CampoTexto etiqueta="Contacto (opcional)" name="contacto" />
          {estado && !estado.ok && !estado.campos ? (
            <p className="eike-campo-error">{estado.error}</p>
          ) : null}
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
