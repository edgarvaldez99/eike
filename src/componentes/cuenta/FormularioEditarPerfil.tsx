"use client";

import { useActionState, useState } from "react";
import { editarPerfilAction } from "@/lib/acciones/cuenta";
import { Boton } from "@/componentes/ui/Boton";
import { AvisoError } from "@/componentes/ui/AvisoError";
import { CampoTexto } from "@/componentes/ui/CampoTexto";
import { Icono } from "@/componentes/ui/Icono";
import { errorCampo, mensajeError } from "@/lib/estado-formulario";
import { useAvisoCambiosSinGuardar } from "@/lib/hooks/useAvisoCambiosSinGuardar";

interface Perfil {
  nombre: string;
  email: string;
  telefono: string | null;
  cedula: string | null;
}

export function FormularioEditarPerfil({ perfil }: { perfil: Perfil }) {
  const [estado, accion, pendiente] = useActionState(editarPerfilAction, null);
  const [sucio, setSucio] = useState(false);
  // Reset del "sucio" al llegar un resultado nuevo y exitoso — patrón de
  // estado derivado durante el render (sin useEffect), ver "Adjusting some
  // state when a prop changes" en la doc de React.
  const [estadoPrevio, setEstadoPrevio] = useState(estado);
  if (estado !== estadoPrevio) {
    setEstadoPrevio(estado);
    if (estado?.ok) setSucio(false);
  }
  useAvisoCambiosSinGuardar(sucio);

  return (
    <form action={accion} onChange={() => setSucio(true)} className="flex flex-col gap-4">
      <CampoTexto
        etiqueta="Nombre"
        name="nombre"
        autoComplete="name"
        required
        defaultValue={perfil.nombre}
        error={errorCampo(estado, "nombre")}
      />
      <CampoTexto
        etiqueta="Email"
        type="email"
        name="email"
        autoComplete="email"
        spellCheck={false}
        required
        defaultValue={perfil.email}
        error={errorCampo(estado, "email")}
      />
      <CampoTexto
        etiqueta="Teléfono"
        name="telefono"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        defaultValue={perfil.telefono ?? ""}
      />
      <CampoTexto
        etiqueta="Cédula"
        name="cedula"
        inputMode="numeric"
        autoComplete="off"
        spellCheck={false}
        defaultValue={perfil.cedula ?? ""}
      />
      <AvisoError mensaje={mensajeError(estado, ["nombre", "email"])} />
      {estado?.ok ? (
        <p className="flex items-center gap-1.5 text-[13px] text-green">
          <Icono nombre="check" /> Datos guardados
        </p>
      ) : null}
      <Boton type="submit" tamano="sm" disabled={pendiente} className="w-fit">
        {pendiente ? "Guardando…" : "Guardar cambios"}
      </Boton>
    </form>
  );
}
