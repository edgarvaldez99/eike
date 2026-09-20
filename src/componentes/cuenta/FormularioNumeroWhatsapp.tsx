"use client";

import { useActionState, useState } from "react";
import { editarNumeroWhatsappAction } from "@/lib/acciones/cuenta";
import { Boton } from "@/componentes/ui/Boton";
import { AvisoError } from "@/componentes/ui/AvisoError";
import { CampoTexto } from "@/componentes/ui/CampoTexto";
import { errorCampo, mensajeError } from "@/lib/estado-formulario";

/**
 * Número de WhatsApp del superadmin (dato de la plataforma, no de cada
 * organizador) — puerto del mismo patrón que FormularioAliasBancario, pero
 * este valor SÍ se muestra en el checkout público: es el número al que el
 * comprador manda su comprobante de pago tras una compra normal o por
 * carrito (ver componentes/publico/AvisoComprobanteWhatsapp.tsx).
 */
export function FormularioNumeroWhatsapp({ valorActual }: { valorActual: string | null }) {
  const [estado, accion, pendiente] = useActionState(editarNumeroWhatsappAction, null);
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

  if (!editando && valorActual) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
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
          Se muestra al comprador después de una compra pendiente de pago (normal o por
          carrito), para que te mande el comprobante por WhatsApp.
        </p>
      </div>
    );
  }

  return (
    <form action={accion} className="flex flex-col gap-4">
      <CampoTexto
        etiqueta="Número de WhatsApp"
        name="numero_whatsapp"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder="0991 234 567"
        required
        defaultValue={valorActual ?? ""}
        error={errorCampo(estado, "numero_whatsapp")}
      />
      <AvisoError mensaje={mensajeError(estado, ["numero_whatsapp"])} />
      <div className="flex gap-2">
        <Boton type="submit" tamano="sm" disabled={pendiente} className="w-fit">
          {pendiente ? "Guardando…" : "Guardar número"}
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
