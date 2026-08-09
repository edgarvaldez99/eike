"use client";

import { useActionState } from "react";
import { editarEventoAction, publicarEventoAction } from "@/lib/acciones/eventos";
import { Boton } from "@/componentes/ui/Boton";
import { CampoTexto } from "@/componentes/ui/CampoTexto";
import { CampoTextarea } from "@/componentes/ui/CampoTextarea";
import { aFechaHoraLocalInput } from "@/lib/fechas";
import type { eventos } from "@/db/esquema";

export function FormularioDatosEvento({ evento }: { evento: typeof eventos.$inferSelect }) {
  const [estado, accion, pendiente] = useActionState(editarEventoAction, null);
  const [estadoPublicar, accionPublicar, pendientePublicar] = useActionState(publicarEventoAction, null);
  const errorCampo = (campo: string) => (estado && !estado.ok ? estado.campos?.[campo] : undefined);
  const puedeEditar = evento.estado !== "cancelado" && evento.estado !== "finalizado";

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
        <CampoTexto
          etiqueta="Aforo total (opcional)"
          type="number"
          min={0}
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

      {evento.estado === "borrador" ? (
        <form action={accionPublicar} className="border-t border-border-soft pt-4">
          <input type="hidden" name="id" value={evento.id} />
          {estadoPublicar && !estadoPublicar.ok ? (
            <p className="eike-campo-error mb-2">{estadoPublicar.error}</p>
          ) : null}
          <Boton type="submit" disabled={pendientePublicar}>
            {pendientePublicar ? "Publicando…" : "Publicar evento"}
          </Boton>
        </form>
      ) : null}
    </div>
  );
}
