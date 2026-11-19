"use client";

import { useState } from "react";
import type { DatosAliasBancario } from "@/server/cuenta";

const ETIQUETA_TIPO: Record<DatosAliasBancario["tipo"], string> = {
  ruc: "RUC",
  cedula: "Cédula de identidad",
  telefono: "Teléfono",
  correo: "Correo",
};

/**
 * Método de pago del checkout. La transferencia bancaria solo está
 * disponible si el superadmin cargó el alias bancario de la plataforma (en
 * /panel/cuenta); Bancard figura como próximo método, deshabilitado.
 */
export function MetodosPago({ alias }: { alias: DatosAliasBancario | null }) {
  const [copiado, setCopiado] = useState(false);
  const disponible = alias !== null;

  async function copiar() {
    if (!alias) return;
    try {
      await navigator.clipboard.writeText(alias.valor);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // sin permiso de portapapeles: el dato sigue visible para copiarlo a mano
    }
  }

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="eike-eyebrow mb-1">Método de pago</legend>

      <label
        className={
          disponible
            ? "flex items-center gap-3 rounded-[var(--radius-eike-sm)] border-2 border-lila bg-surface-2 p-3 font-bold"
            : "flex items-center gap-3 rounded-[var(--radius-eike-sm)] border border-border p-3 text-muted opacity-60"
        }
      >
        <input type="radio" name="metodo_pago" value="transferencia" defaultChecked={disponible} disabled={!disponible} />
        <span className="flex-1">Transferencia bancaria (Paraguay)</span>
        {disponible ? null : <span className="text-[11px] uppercase tracking-wide">No disponible</span>}
      </label>

      <label className="flex items-center gap-3 rounded-[var(--radius-eike-sm)] border border-border p-3 text-muted opacity-60">
        <input type="radio" name="metodo_pago" value="bancard" disabled />
        <span className="flex-1">Bancard (tarjetas)</span>
        <span className="text-[11px] uppercase tracking-wide">Próximamente</span>
      </label>

      {alias ? (
        <div className="rounded-[var(--radius-eike-sm)] border border-border p-4 text-[13px]">
          <p className="font-extrabold">Datos para la transferencia</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-muted">Alias ({ETIQUETA_TIPO[alias.tipo]}):</span>
            <strong>{alias.valor}</strong>
            <button type="button" onClick={copiar} className="eike-btn eike-btn--ghost eike-btn--sm">
              {copiado ? "¡Copiado!" : "Copiar"}
            </button>
          </div>

          <p className="mt-4 font-extrabold">Importante</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-muted">
            <li>En el comprobante debe verse NOMBRE y APELLIDO, FECHA Y HORA y NÚMERO DE COMPROBANTE.</li>
            <li>Una vez hecha la transferencia, verificá desde la app de tu banco que se haya procesado.</li>
            <li>Algunas transferencias pueden ser rechazadas o revertidas; si el dinero no se acredita, el pedido no se procesa.</li>
            <li>Si el banco te devuelve el dinero, tenés que volver a transferir.</li>
          </ul>
        </div>
      ) : (
        <p role="status" className="text-[13px] text-muted">
          Por el momento no hay métodos de pago disponibles. Volvé a intentar más tarde.
        </p>
      )}
    </fieldset>
  );
}
