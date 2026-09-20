"use client";

import { useId } from "react";
import { cn } from "@/lib/cn";

type PropsCampoTexto = React.InputHTMLAttributes<HTMLInputElement> & {
  etiqueta: string;
  etiquetaOculta?: boolean;
  error?: string;
};

export function CampoTexto({ etiqueta, etiquetaOculta, error, id, className, ...props }: PropsCampoTexto) {
  const idGenerado = useId();
  const idCampo = id ?? idGenerado;
  const idError = `${idCampo}-error`;
  return (
    <div>
      <label htmlFor={idCampo} className={cn("eike-campo-label", etiquetaOculta && "sr-only")}>
        {etiqueta}
      </label>
      <input
        id={idCampo}
        className={cn("eike-campo-input", className)}
        aria-describedby={error ? idError : undefined}
        aria-invalid={error ? true : undefined}
        {...props}
      />
      {error ? (
        <p id={idError} className="eike-campo-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
