"use client";

import { useId } from "react";
import { cn } from "@/lib/cn";

type PropsCampoTextarea = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  etiqueta: string;
  error?: string;
};

export function CampoTextarea({ etiqueta, error, id, className, ...props }: PropsCampoTextarea) {
  const idGenerado = useId();
  const idCampo = id ?? idGenerado;
  const idError = `${idCampo}-error`;
  return (
    <div>
      <label htmlFor={idCampo} className="eike-campo-label">
        {etiqueta}
      </label>
      <textarea
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
