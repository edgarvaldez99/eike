"use client";

import { useActionState } from "react";
import { aceptarInvitacionAction } from "@/lib/acciones/staff-publico";
import { Boton } from "@/componentes/ui/Boton";
import { AvisoError } from "@/componentes/ui/AvisoError";
import { CampoTexto } from "@/componentes/ui/CampoTexto";
import { errorCampo, mensajeError } from "@/lib/estado-formulario";

export function FormularioAceptarInvitacion({ token }: { token: string }) {
  const [estado, accion, pendiente] = useActionState(aceptarInvitacionAction, null);

  return (
    <form action={accion} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <CampoTexto etiqueta="Nombre" name="nombre" autoComplete="name" required error={errorCampo(estado, "nombre")} />
      <CampoTexto
        etiqueta="Email"
        type="email"
        name="email"
        autoComplete="email"
        spellCheck={false}
        required
        error={errorCampo(estado, "email")}
      />
      <CampoTexto
        etiqueta="Contraseña"
        type="password"
        name="password"
        autoComplete="new-password"
        required
        minLength={8}
        error={errorCampo(estado, "password")}
      />
      <AvisoError mensaje={mensajeError(estado, ["nombre", "email", "password"])} />
      <Boton type="submit" disabled={pendiente} className="justify-center">
        {pendiente ? "Creando cuenta…" : "Crear cuenta y empezar"}
      </Boton>
    </form>
  );
}
