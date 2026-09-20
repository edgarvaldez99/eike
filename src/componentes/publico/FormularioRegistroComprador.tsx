"use client";

import { useActionState } from "react";
import { registrarCompradorAction } from "@/lib/acciones/usuarios";
import { Boton } from "@/componentes/ui/Boton";
import { AvisoError } from "@/componentes/ui/AvisoError";
import { CampoTexto } from "@/componentes/ui/CampoTexto";
import { errorCampo, mensajeError } from "@/lib/estado-formulario";

export function FormularioRegistroComprador({ volver }: { volver: string }) {
  const [estado, accion, pendiente] = useActionState(registrarCompradorAction, null);

  return (
    <form action={accion} className="flex flex-col gap-4">
      <input type="hidden" name="volver" value={volver} />
      <CampoTexto
        etiqueta="Nombre completo"
        name="nombre"
        autoComplete="name"
        required
        error={errorCampo(estado, "nombre")}
      />
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
      <CampoTexto
        etiqueta="Teléfono (opcional)"
        name="telefono"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
      />
      <CampoTexto
        etiqueta="Cédula (opcional)"
        name="cedula"
        inputMode="numeric"
        autoComplete="off"
        spellCheck={false}
      />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="tyc_aceptado" required />
        Acepto los Términos y Condiciones / Política de Privacidad
      </label>
      <AvisoError mensaje={mensajeError(estado, ["nombre", "email", "password"])} />
      <Boton type="submit" disabled={pendiente} className="justify-center">
        {pendiente ? "Creando cuenta…" : "Crear cuenta"}
      </Boton>
    </form>
  );
}
