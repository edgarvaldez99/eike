"use client";

import { useActionState, useState } from "react";
import { invitarStaffAction } from "@/lib/acciones/staff";
import { Boton } from "@/componentes/ui/Boton";
import { Modal } from "@/componentes/ui/Modal";

export function FormularioInvitarStaff({
  eventoId,
  origenSitio,
}: {
  eventoId: number;
  origenSitio: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [estado, accion, pendiente] = useActionState(invitarStaffAction, null);
  const [copiado, setCopiado] = useState(false);

  // `origenSitio` viene del servidor (SITE_URL) — nunca leer `window` acá: Next
  // vuelve a renderizar este componente en el servidor cuando la Server Action
  // responde, y `window` no existe ahí (ReferenceError).
  const link = estado && estado.ok ? `${origenSitio}/staff/aceptar/${estado.datos.token}` : null;

  return (
    <>
      <Boton tamano="sm" onClick={() => setAbierto(true)}>
        + Invitar staff
      </Boton>
      <Modal titulo="Invitar staff" abierto={abierto} onCerrar={() => setAbierto(false)}>
        {!link ? (
          <form action={accion} className="flex flex-col gap-4">
            <input type="hidden" name="evento_id" value={eventoId} />
            <p className="text-[13px] text-muted">
              Se genera un link de invitación de un solo uso, válido por 72 horas. La persona lo usa para
              crear su propia cuenta de staff, con acceso solo al escáner de este evento.
            </p>
            {estado && !estado.ok ? <p className="eike-campo-error">{estado.error}</p> : null}
            <Boton type="submit" disabled={pendiente} className="justify-center">
              {pendiente ? "Generando…" : "Generar link"}
            </Boton>
          </form>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-[13px] text-muted">Compartí este link con la persona (WhatsApp, email, etc.):</p>
            <code className="eike-campo-input block break-all font-mono text-[12px] text-cyan">{link}</code>
            <Boton
              variante="ghost"
              tamano="sm"
              className="w-fit"
              onClick={() => {
                navigator.clipboard.writeText(link);
                setCopiado(true);
              }}
            >
              {copiado ? "¡Copiado!" : "Copiar link"}
            </Boton>
          </div>
        )}
      </Modal>
    </>
  );
}
