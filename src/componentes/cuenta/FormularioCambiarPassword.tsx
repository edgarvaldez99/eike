"use client";

import { useActionState, useRef } from "react";
import { cambiarPasswordAction } from "@/lib/acciones/cuenta";
import { Boton } from "@/componentes/ui/Boton";
import { CampoTexto } from "@/componentes/ui/CampoTexto";

export function FormularioCambiarPassword() {
  const [estado, accion, pendiente] = useActionState(cambiarPasswordAction, null);
  const refFormulario = useRef<HTMLFormElement>(null);
  const errorCampo = (campo: string) => (estado && !estado.ok ? estado.campos?.[campo] : undefined);

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
        required
        error={errorCampo("password_actual")}
      />
      <CampoTexto
        etiqueta="Contraseña nueva"
        type="password"
        name="password_nueva"
        required
        error={errorCampo("password_nueva")}
      />
      <CampoTexto
        etiqueta="Confirmar contraseña nueva"
        type="password"
        name="password_confirmar"
        required
        error={errorCampo("password_confirmar")}
      />
      {estado && !estado.ok && !estado.campos ? <p className="eike-campo-error">{estado.error}</p> : null}
      {estado?.ok ? <p className="text-[13px] text-green">Contraseña actualizada ✓</p> : null}
      <Boton type="submit" tamano="sm" disabled={pendiente} className="w-fit">
        {pendiente ? "Actualizando…" : "Cambiar contraseña"}
      </Boton>
    </form>
  );
}
