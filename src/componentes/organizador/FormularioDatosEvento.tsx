"use client";

import { useActionState, useState } from "react";
import { editarEventoAction } from "@/lib/acciones/eventos";
import { Boton } from "@/componentes/ui/Boton";
import { AvisoError } from "@/componentes/ui/AvisoError";
import { CampoMonto } from "@/componentes/ui/CampoMonto";
import { CampoTexto } from "@/componentes/ui/CampoTexto";
import { CampoTextarea } from "@/componentes/ui/CampoTextarea";
import { BotonSolicitarAprobacion } from "@/componentes/organizador/BotonSolicitarAprobacion";
import { aFechaHoraLocalInput } from "@/lib/fechas";
import { errorCampo, mensajeError } from "@/lib/estado-formulario";
import { useAvisoCambiosSinGuardar } from "@/lib/hooks/useAvisoCambiosSinGuardar";
import type { eventos } from "@/db/esquema";

export function FormularioDatosEvento({ evento }: { evento: typeof eventos.$inferSelect }) {
  const [estado, accion, pendiente] = useActionState(editarEventoAction, null);
  const [sucio, setSucio] = useState(false);
  // Reset del "sucio" al llegar un resultado nuevo y exitoso — patrón de
  // estado derivado durante el render (sin useEffect), ver "Adjusting some
  // state when a prop changes" en la doc de React.
  const [estadoPrevio, setEstadoPrevio] = useState(estado);
  if (estado !== estadoPrevio) {
    setEstadoPrevio(estado);
    if (estado?.ok) setSucio(false);
  }
  useAvisoCambiosSinGuardar(sucio);
  // Solo lectura fuera de 'borrador'/'rechazado' — pedido anti-estafa: una
  // vez que se solicita la aprobación, nada se puede tocar hasta que el
  // superadmin lo resuelva (ver guardas.verificarEventoEditable, mismo
  // criterio en el servidor).
  const puedeEditar = evento.estado === "borrador" || evento.estado === "rechazado";

  return (
    <div className="flex flex-col gap-4">
      <form action={accion} onChange={() => setSucio(true)} className="flex flex-col gap-4">
        <input type="hidden" name="id" value={evento.id} />
        <CampoTexto
          etiqueta="Nombre"
          name="nombre"
          defaultValue={evento.nombre}
          required
          disabled={!puedeEditar}
          error={errorCampo(estado, "nombre")}
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
          error={errorCampo(estado, "fecha_evento")}
        />
        <CampoTexto etiqueta="Lugar" name="lugar" defaultValue={evento.lugar ?? ""} disabled={!puedeEditar} />
        <CampoMonto
          etiqueta="Aforo total (opcional)"
          name="aforo_total"
          defaultValue={evento.aforoTotal ?? ""}
          disabled={!puedeEditar}
        />
        <AvisoError mensaje={mensajeError(estado, ["nombre", "fecha_evento"])} />
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
