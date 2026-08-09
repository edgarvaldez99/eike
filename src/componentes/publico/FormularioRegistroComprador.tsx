"use client";

import { useActionState } from "react";
import { registrarCompradorAction } from "@/lib/acciones/usuarios";
import { Boton } from "@/componentes/ui/Boton";
import { CampoTexto } from "@/componentes/ui/CampoTexto";

export function FormularioRegistroComprador({ volver }: { volver: string }) {
  const [estado, accion, pendiente] = useActionState(registrarCompradorAction, null);
  const errorCampo = (campo: string) => (estado && !estado.ok ? estado.campos?.[campo] : undefined);

  return (
    <form action={accion} className="flex flex-col gap-4">
      <input type="hidden" name="volver" value={volver} />
      <CampoTexto etiqueta="Nombre completo" name="nombre" required error={errorCampo("nombre")} />
      <CampoTexto etiqueta="Email" type="email" name="email" required error={errorCampo("email")} />
      <CampoTexto
        etiqueta="Contraseña"
        type="password"
        name="password"
        required
        minLength={8}
        error={errorCampo("password")}
      />
      <CampoTexto etiqueta="Teléfono (opcional)" name="telefono" />
      <CampoTexto etiqueta="Cédula (opcional)" name="cedula" />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="tyc_aceptado" required />
        Acepto los Términos y Condiciones / Política de Privacidad
      </label>
      {estado && !estado.ok && !estado.campos ? <p className="eike-campo-error">{estado.error}</p> : null}
      <Boton type="submit" disabled={pendiente} className="justify-center">
        {pendiente ? "Creando cuenta…" : "Crear cuenta"}
      </Boton>
    </form>
  );
}
