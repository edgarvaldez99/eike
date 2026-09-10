"use client";

import { useActionState } from "react";
import { editarEventoAction } from "@/lib/acciones/eventos";
import { Boton } from "@/componentes/ui/Boton";
import { CampoMonto } from "@/componentes/ui/CampoMonto";
import { CampoTexto } from "@/componentes/ui/CampoTexto";
import { CampoTextarea } from "@/componentes/ui/CampoTextarea";
import { BotonSolicitarAprobacion } from "@/componentes/organizador/BotonSolicitarAprobacion";
import { aFechaHoraLocalInput } from "@/lib/fechas";
import type { eventos } from "@/db/esquema";

export function FormularioDatosEvento({ evento }: { evento: typeof eventos.$inferSelect }) {
  const [estado, accion, pendiente] = useActionState(editarEventoAction, null);
  const errorCampo = (campo: string) => (estado && !estado.ok ? estado.campos?.[campo] : undefined);
  // Solo lectura fuera de 'borrador'/'rechazado' — pedido anti-estafa: una
  // vez que se solicita la aprobación, nada se puede tocar hasta que el
  // superadmin lo resuelva (ver guardas.verificarEventoEditable, mismo
  // criterio en el servidor).
  const puedeEditar = evento.estado === "borrador" || evento.estado === "rechazado";

  return (
    <div className="flex flex-col gap-4">
      <form action={accion} className="flex flex-col gap-4">
        <input type="hidden" name="id" value={evento.id} />
        <CampoTexto
          etiqueta="Nombre"
          name="nombre"
          defaultValue={evento.nombre}
          required
          disabled={!puedeEditar}
          error={errorCampo("nombre")}
        />
        <CampoTextarea
          etiqueta="Descripción"
          name="descripcion"
          rows={3}
          defaultValue={evento.descripcion ?? ""}
          disabled={!puedeEditar}
        />
        <CampoTexto
          etiqueta="Fecha y hora"
          type="datetime-local"
          name="fecha_evento"
          defaultValue={aFechaHoraLocalInput(evento.fechaEvento)}
          required
          disabled={!puedeEditar}
          error={errorCampo("fecha_evento")}
        />
        <CampoTexto etiqueta="Lugar" name="lugar" defaultValue={evento.lugar ?? ""} disabled={!puedeEditar} />
        <CampoMonto
          etiqueta="Aforo total (opcional)"
          name="aforo_total"
          defaultValue={evento.aforoTotal ?? ""}
          disabled={!puedeEditar}
        />
        {estado && !estado.ok ? <p className="eike-campo-error">{estado.error}</p> : null}
        {estado && estado.ok ? <p className="text-[12px] text-green">Guardado.</p> : null}
        {puedeEditar ? (
          <Boton type="submit" disabled={pendiente} className="w-fit">
            {pendiente ? "Guardando…" : "Guardar cambios"}
          </Boton>
        ) : null}
      </form>

      {puedeEditar ? (
        <div className="border-t border-border-soft pt-4">
          <BotonSolicitarAprobacion eventoId={evento.id} />
        </div>
      ) : null}
    </div>
  );
}
