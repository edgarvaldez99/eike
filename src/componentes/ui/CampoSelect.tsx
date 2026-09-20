"use client";

import { useId } from "react";
import { cn } from "@/lib/cn";

type PropsCampoSelect = React.SelectHTMLAttributes<HTMLSelectElement> & {
  etiqueta: string;
  /** Label accesible pero visualmente oculto — para filtros compactos donde
   * el texto ya está implícito en el primer <option> ("Todos los..."). */
  etiquetaOculta?: boolean;
  error?: string;
};

export function CampoSelect({
  etiqueta,
  etiquetaOculta,
  error,
  id,
  className,
  children,
  ...props
}: PropsCampoSelect) {
  const idGenerado = useId();
  const idCampo = id ?? idGenerado;
  const idError = `${idCampo}-error`;
  return (
    <div>
      <label htmlFor={idCampo} className={cn("eike-campo-label", etiquetaOculta && "sr-only")}>
        {etiqueta}
      </label>
      <select
        id={idCampo}
        className={cn("eike-campo-input", className)}
        aria-describedby={error ? idError : undefined}
        aria-invalid={error ? true : undefined}
        {...props}
      >
        {children}
      </select>
      {error ? (
        <p id={idError} className="eike-campo-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
