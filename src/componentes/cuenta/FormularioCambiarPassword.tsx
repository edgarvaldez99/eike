"use client";

import { useActionState, useRef } from "react";
import { cambiarPasswordAction } from "@/lib/acciones/cuenta";
import { Boton } from "@/componentes/ui/Boton";
import { AvisoError } from "@/componentes/ui/AvisoError";
import { CampoTexto } from "@/componentes/ui/CampoTexto";
import { Icono } from "@/componentes/ui/Icono";
import { errorCampo, mensajeError } from "@/lib/estado-formulario";

export function FormularioCambiarPassword() {
  const [estado, accion, pendiente] = useActionState(cambiarPasswordAction, null);
  const refFormulario = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={refFormulario}
      action={async (fd) => {
        await accion(fd);
        // Nunca dejar la contraseña actual/nueva tipeadas en el DOM después
        // de un intento (exitoso o no) — ni por error de tipeo ni por un ojo
        // curioso mirando por encima del hombro.
        refFormulario.current?.reset();
      }}
      className="flex flex-col gap-4"
    >
      <CampoTexto
        etiqueta="Contraseña actual"
        type="password"
        name="password_actual"
        autoComplete="current-password"
        required
        error={errorCampo(estado, "password_actual")}
      />
      <CampoTexto
        etiqueta="Contraseña nueva"
        type="password"
        name="password_nueva"
        autoComplete="new-password"
        required
        error={errorCampo(estado, "password_nueva")}
      />
      <CampoTexto
        etiqueta="Confirmar contraseña nueva"
        type="password"
        name="password_confirmar"
        autoComplete="new-password"
        required
        error={errorCampo(estado, "password_confirmar")}
      />
      <AvisoError
        mensaje={mensajeError(estado, ["password_actual", "password_nueva", "password_confirmar"])}
      />
      {estado?.ok ? (
        <p className="flex items-center gap-1.5 text-[13px] text-green">
          <Icono nombre="check" /> Contraseña actualizada
        </p>
      ) : null}
      <Boton type="submit" tamano="sm" disabled={pendiente} className="w-fit">
        {pendiente ? "Actualizando…" : "Cambiar contraseña"}
      </Boton>
    </form>
  );
}
