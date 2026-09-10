"use client";

import { useEffect, useState } from "react";
import { obtenerMiCodigoReferidoAction } from "@/lib/acciones/cuenta";

/**
 * Compartir un evento. En celular, `navigator.share()` abre el selector
 * nativo del sistema (WhatsApp, Instagram, lo que tenga instalado) — es
 * como se comparte un evento en la práctica en Paraguay. En escritorio (o
 * si el navegador no soporta Web Share) cae a copiar el link, y quedan
 * además los links directos de siempre a mano.
 *
 * Fase 8 del plan de mejoras: si quien comparte está logueado (y tiene
 * código de referido, ver /panel/cuenta), el link sale con `?ref=` — el
 * botón de compartir se vuelve, sin fricción extra, el link de referido.
 * El código se busca acá, del lado del cliente, a propósito: esta página
 * tiene ISR (SEO-crítica) y leer la sesión ahí adentro la volvería
 * dinámica para todos los visitantes, no solo para quien está logueado.
 */
export function BotonCompartir({ titulo, url }: { titulo: string; url: string }) {
  const [copiado, setCopiado] = useState(false);
  const [codigoReferido, setCodigoReferido] = useState<string | null>(null);

  useEffect(() => {
    obtenerMiCodigoReferidoAction()
      .then(setCodigoReferido)
      .catch(() => {}); // sin código, el link comparte igual, solo sin atribución
  }, []);

  const urlEfectiva = codigoReferido ? `${url}?ref=${codigoReferido}` : url;

  async function compartir() {
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title: titulo, url: urlEfectiva });
        return;
      } catch {
        // el usuario canceló el selector nativo, o el navegador lo rechazó — sigue al fallback
      }
    }
    try {
      await navigator.clipboard.writeText(urlEfectiva);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // sin permiso de portapapeles: no rompe nada, los links de abajo siguen sirviendo
    }
  }

  const textoCompartido = `${titulo} — ${urlEfectiva}`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={compartir} className="eike-btn eike-btn--cyan eike-btn--sm">
        {copiado ? "¡Link copiado!" : "🔗 Compartir"}
      </button>
      <a
        href={`https://wa.me/?text=${encodeURIComponent(textoCompartido)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="eike-btn eike-btn--ghost eike-btn--sm"
      >
        WhatsApp
      </a>
      <a
        href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(urlEfectiva)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="eike-btn eike-btn--ghost eike-btn--sm"
      >
        Facebook
      </a>
      <a
        href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(titulo)}&url=${encodeURIComponent(urlEfectiva)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="eike-btn eike-btn--ghost eike-btn--sm"
      >
        X
      </a>
    </div>
  );
}
