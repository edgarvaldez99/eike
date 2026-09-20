"use client";

import { useActionState } from "react";
import { iniciarSesionAction } from "@/lib/acciones/auth";
import { Boton } from "@/componentes/ui/Boton";
import { AvisoError } from "@/componentes/ui/AvisoError";
import { CampoTexto } from "@/componentes/ui/CampoTexto";
import { errorCampo, mensajeError } from "@/lib/estado-formulario";

export function FormularioLogin() {
  const [estado, accion, pendiente] = useActionState(iniciarSesionAction, null);

  return (
    <form action={accion} className="flex flex-col gap-4">
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
        autoComplete="current-password"
        required
        error={errorCampo(estado, "password")}
      />
      <AvisoError mensaje={mensajeError(estado, ["email", "password"])} />
      <Boton type="submit" disabled={pendiente} className="justify-center">
        {pendiente ? "Ingresando…" : "Ingresar"}
      </Boton>
    </form>
  );
}
