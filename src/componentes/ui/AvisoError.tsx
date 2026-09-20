"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";

/**
 * Reemplaza los <p className="eike-campo-error"> sueltos para errores
 * globales de formulario/acción. Foco automático al aparecer: sin esto, un
 * lector de pantalla no se entera de que algo falló si el foco se queda en
 * el botón que se acaba de apretar. `role="alert"` alcanza para el anuncio;
 * el foco es lo que le da al usuario un punto de partida para leerlo.
 */
export function AvisoError({ mensaje, className }: { mensaje: string | undefined; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (mensaje) ref.current?.focus();
  }, [mensaje]);

  if (!mensaje) return null;

  return (
    <p ref={ref} role="alert" tabIndex={-1} className={cn("eike-campo-error", className)}>
      {mensaje}
    </p>
  );
}
