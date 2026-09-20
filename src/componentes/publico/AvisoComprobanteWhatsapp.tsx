"use client";

import { useState } from "react";
import { Icono } from "@/componentes/ui/Icono";
import { linkWhatsapp } from "@/lib/formato";

/**
 * Aviso post-compra: a qué número de WhatsApp mandar el comprobante de pago
 * (pedido explícito — antes esto se le mandaba a mano al comprador, ver
 * FormularioAliasBancario). Se muestra en /entradas/[codigo] (compra
 * normal) y /entradas/orden/[codigo] (compra por carrito) cuando la compra
 * quedó pendiente de aprobación y no fue gratuita. Si el superadmin todavía
 * no cargó el número (ver /panel/cuenta), el componente no se renderiza —
 * la página que lo usa ya filtra ese caso pasando `numero`.
 */
export function AvisoComprobanteWhatsapp({ numero, codigo }: { numero: string; codigo: string }) {
  const [copiado, setCopiado] = useState(false);
  const mensaje = `Hola, te mando el comprobante de mi compra ${codigo} en Eike.`;

  async function copiar() {
    try {
      await navigator.clipboard.writeText(numero);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // sin permiso de portapapeles: el número sigue visible para copiar a mano
    }
  }

  return (
    <div className="eike-card mt-4 flex flex-col gap-3 p-4 text-left">
      <div>
        <p className="flex items-center gap-1.5 text-[13px] font-extrabold">
          <Icono nombre="whatsapp" /> Mandanos tu comprobante por WhatsApp
        </p>
        <p className="mt-1 text-[13px] text-muted">
          Tu compra quedó pendiente de aprobación. Para agilizar la verificación, enviá el
          comprobante de pago a este número, mencionando el código <strong>{codigo}</strong>.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <code className="rounded-[var(--radius-eike-sm)] border border-border bg-surface-2 px-3 py-1.5 font-mono text-[15px] tracking-wide">
          {numero}
        </code>
        <button type="button" onClick={copiar} className="eike-btn eike-btn--ghost eike-btn--sm">
          {copiado ? "¡Copiado!" : "Copiar"}
        </button>
        <a
          href={linkWhatsapp(numero, mensaje)}
          target="_blank"
          rel="noopener noreferrer"
          className="eike-btn eike-btn--cyan eike-btn--sm"
        >
          Abrir WhatsApp
        </a>
      </div>
    </div>
  );
}
