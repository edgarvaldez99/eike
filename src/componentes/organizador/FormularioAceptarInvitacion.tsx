"use client";

import { useActionState } from "react";
import { aceptarInvitacionAction } from "@/lib/acciones/staff-publico";
import { Boton } from "@/componentes/ui/Boton";
import { CampoTexto } from "@/componentes/ui/CampoTexto";

export function FormularioAceptarInvitacion({ token }: { token: string }) {
  const [estado, accion, pendiente] = useActionState(aceptarInvitacionAction, null);
  const errorCampo = (campo: string) => (estado && !estado.ok ? estado.campos?.[campo] : undefined);

  return (
    <form action={accion} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <CampoTexto etiqueta="Nombre" name="nombre" required error={errorCampo("nombre")} />
      <CampoTexto etiqueta="Email" type="email" name="email" required error={errorCampo("email")} />
      <CampoTexto
        etiqueta="Contraseña"
        type="password"
        name="password"
        required
        minLength={8}
        error={errorCampo("password")}
      />
      {estado && !estado.ok && !estado.campos ? (
        <p className="eike-campo-error">{estado.error}</p>
      ) : null}
      <Boton type="submit" disabled={pendiente} className="justify-center">
        {pendiente ? "Creando cuenta…" : "Crear cuenta y empezar"}
      </Boton>
    </form>
  );
}
