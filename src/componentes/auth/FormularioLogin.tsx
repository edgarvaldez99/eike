"use client";

import { useActionState } from "react";
import { iniciarSesionAction } from "@/lib/acciones/auth";
import { Boton } from "@/componentes/ui/Boton";
import { CampoTexto } from "@/componentes/ui/CampoTexto";

export function FormularioLogin() {
  const [estado, accion, pendiente] = useActionState(iniciarSesionAction, null);

  return (
    <form action={accion} className="flex flex-col gap-4">
      <CampoTexto
        etiqueta="Email"
        type="email"
        name="email"
        autoComplete="email"
        required
        error={estado && !estado.ok ? estado.campos?.email : undefined}
      />
      <CampoTexto
        etiqueta="Contraseña"
        type="password"
        name="password"
        autoComplete="current-password"
        required
        error={estado && !estado.ok ? estado.campos?.password : undefined}
      />
      {estado && !estado.ok && !estado.campos ? (
        <p className="eike-campo-error">{estado.error}</p>
      ) : null}
      <Boton type="submit" disabled={pendiente} className="justify-center">
        {pendiente ? "Ingresando…" : "Ingresar"}
      </Boton>
    </form>
  );
}
