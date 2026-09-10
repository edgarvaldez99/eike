"use client";

import { useActionState, useState } from "react";
import { editarAliasBancarioAction } from "@/lib/acciones/cuenta";
import { Boton } from "@/componentes/ui/Boton";
import { CampoTexto } from "@/componentes/ui/CampoTexto";
import type { TipoAliasBancario } from "@/lib/constantes";

const ETIQUETA_TIPO: Record<TipoAliasBancario, string> = {
  ruc: "RUC",
  cedula: "Cédula / CI",
  telefono: "Teléfono",
  correo: "Correo electrónico",
};

/**
 * Alias bancario del superadmin (dato de la plataforma, no de cada
 * organizador) — para el mensaje de WhatsApp con las instrucciones de pago,
 * nunca se muestra en el checkout. En Paraguay el alias interbancario
 * (SIPAP) se identifica por RUC, cédula/CI, teléfono o correo.
 */
export function FormularioAliasBancario({
  tipoActual,
  valorActual,
}: {
  tipoActual: TipoAliasBancario | null;
  valorActual: string | null;
}) {
  const [estado, accion, pendiente] = useActionState(editarAliasBancarioAction, null);
  const [editando, setEditando] = useState(!valorActual);
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    if (!valorActual) return;
    try {
      await navigator.clipboard.writeText(valorActual);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // sin permiso de portapapeles: el valor sigue visible para copiar a mano
    }
  }

  if (!editando && valorActual && tipoActual) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[13px] text-muted">{ETIQUETA_TIPO[tipoActual]}:</span>
          <code className="rounded-[var(--radius-eike-sm)] border border-border bg-surface-2 px-3 py-1.5 font-mono text-[15px] tracking-wide">
            {valorActual}
          </code>
          <Boton type="button" variante="ghost" tamano="sm" onClick={copiar}>
            {copiado ? "¡Copiado!" : "Copiar"}
          </Boton>
          <Boton type="button" variante="ghost" tamano="sm" onClick={() => setEditando(true)}>
            Editar
          </Boton>
        </div>
        <p className="text-[12.5px] text-muted">
          Usalo para el mensaje de WhatsApp con las instrucciones de pago — no se muestra en el checkout.
        </p>
      </div>
    );
  }

  return (
    <form action={accion} className="flex flex-col gap-4">
      <div>
        <label htmlFor="alias_bancario_tipo" className="eike-campo-label">
          Tipo de alias
        </label>
        <select
          id="alias_bancario_tipo"
          name="alias_bancario_tipo"
          className="eike-campo-input"
          defaultValue={tipoActual ?? "ruc"}
        >
          <option value="ruc">RUC</option>
          <option value="cedula">Cédula / CI</option>
          <option value="telefono">Teléfono</option>
          <option value="correo">Correo electrónico</option>
        </select>
      </div>
      <CampoTexto
        etiqueta="Valor del alias"
        name="alias_bancario_valor"
        required
        defaultValue={valorActual ?? ""}
        error={estado && !estado.ok ? estado.campos?.alias_bancario_valor : undefined}
      />
      {estado && !estado.ok && !estado.campos ? <p className="eike-campo-error">{estado.error}</p> : null}
      <div className="flex gap-2">
        <Boton type="submit" tamano="sm" disabled={pendiente} className="w-fit">
          {pendiente ? "Guardando…" : "Guardar alias"}
        </Boton>
        {valorActual ? (
          <Boton type="button" variante="ghost" tamano="sm" onClick={() => setEditando(false)}>
            Cancelar
          </Boton>
        ) : null}
      </div>
    </form>
  );
}
