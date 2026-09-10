"use client";

import { useActionState } from "react";
import { editarPerfilAction } from "@/lib/acciones/cuenta";
import { Boton } from "@/componentes/ui/Boton";
import { CampoTexto } from "@/componentes/ui/CampoTexto";

interface Perfil {
  nombre: string;
  email: string;
  telefono: string | null;
  cedula: string | null;
}

export function FormularioEditarPerfil({ perfil }: { perfil: Perfil }) {
  const [estado, accion, pendiente] = useActionState(editarPerfilAction, null);
  const errorCampo = (campo: string) => (estado && !estado.ok ? estado.campos?.[campo] : undefined);

  return (
    <form action={accion} className="flex flex-col gap-4">
      <CampoTexto etiqueta="Nombre" name="nombre" required defaultValue={perfil.nombre} error={errorCampo("nombre")} />
      <CampoTexto
        etiqueta="Email"
        type="email"
        name="email"
        required
        defaultValue={perfil.email}
        error={errorCampo("email")}
      />
      <CampoTexto etiqueta="Teléfono" name="telefono" defaultValue={perfil.telefono ?? ""} />
      <CampoTexto etiqueta="Cédula" name="cedula" defaultValue={perfil.cedula ?? ""} />
      {estado && !estado.ok && !estado.campos ? <p className="eike-campo-error">{estado.error}</p> : null}
      {estado?.ok ? <p className="text-[13px] text-green">Datos guardados ✓</p> : null}
      <Boton type="submit" tamano="sm" disabled={pendiente} className="w-fit">
        {pendiente ? "Guardando…" : "Guardar cambios"}
      </Boton>
    </form>
  );
}
