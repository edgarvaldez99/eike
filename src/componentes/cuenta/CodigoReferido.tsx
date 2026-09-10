"use client";

import { useState } from "react";
import { Boton } from "@/componentes/ui/Boton";

/** Código de vendedor/referido (Fase 8 del plan de mejoras) — mostrado en
 * /panel/cuenta. Compartir el link de cualquier evento con `?ref=CODIGO`
 * atribuye la venta a este usuario (ver proxy.ts + server/referidos.ts). */
export function CodigoReferido({ codigo }: { codigo: string }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(codigo);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // sin permiso de portapapeles: no rompe nada, el código sigue visible para copiar a mano
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <code className="rounded-[var(--radius-eike-sm)] border border-border bg-surface-2 px-3 py-1.5 font-mono text-[15px] tracking-wide">
          {codigo}
        </code>
        <Boton type="button" variante="ghost" tamano="sm" onClick={copiar}>
          {copiado ? "¡Copiado!" : "Copiar"}
        </Boton>
      </div>
      <p className="text-[12.5px] text-muted">
        Compartí este código, o agregá <code>?ref={codigo}</code> al link de cualquier evento. Si alguien compra
        una entrada por ese link, la venta se te atribuye.
      </p>
    </div>
  );
}
