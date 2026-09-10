"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";

const formateador = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 });

type PropsCampoMonto = Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value" | "type"> & {
  etiqueta: string;
  error?: string;
  name: string;
  defaultValue?: number | string;
};

/**
 * Como CampoTexto pero para números grandes (precios, aforo, cantidades) —
 * muestra separador de miles es-PY mientras se escribe ("1.000.000"), pero
 * manda el número crudo al form vía un input oculto con el mismo `name`
 * (el campo visible no lleva `name`, así no se pisan). Los esquemas Zod del
 * lado del servidor ya usan z.coerce.number(), así que no cambia nada ahí.
 *
 * type="text" + inputMode="numeric" a propósito: un <input type="number">
 * nunca puede mostrar separadores mientras se escribe, es una limitación
 * del navegador, no de este componente.
 */
export function CampoMonto({ etiqueta, error, id, name, defaultValue, className, ...props }: PropsCampoMonto) {
  const idCampo = id ?? name;
  const inicial = defaultValue !== undefined && defaultValue !== "" ? Number(defaultValue) : NaN;
  const [crudo, setCrudo] = useState<string>(Number.isFinite(inicial) ? String(inicial) : "");

  const visible = crudo === "" ? "" : formateador.format(Number(crudo));

  return (
    <div>
      <label htmlFor={idCampo} className="eike-campo-label">
        {etiqueta}
      </label>
      <input
        id={idCampo}
        className={cn("eike-campo-input", className)}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={visible}
        onChange={(e) => {
          // Solo dígitos: pegar "1.000.000" o "1,000,000" también funciona,
          // se descarta cualquier separador que el usuario haya tipeado.
          const soloDigitos = e.target.value.replace(/[^0-9]/g, "").replace(/^0+(?=\d)/, "");
          setCrudo(soloDigitos);
        }}
        {...props}
      />
      <input type="hidden" name={name} value={crudo} />
      {error ? <p className="eike-campo-error">{error}</p> : null}
    </div>
  );
}
