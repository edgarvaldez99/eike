"use client";

import { useEffect, useState } from "react";
import { Icono } from "@/componentes/ui/Icono";
import { linkWhatsapp } from "@/lib/formato";

/**
 * Aviso post-compra: a qué número de WhatsApp mandar el comprobante de pago
 * (pedido explícito — antes esto se le mandaba a mano al comprador, ver
 * FormularioAliasBancario). Se muestra en /entradas/[codigo] (compra
 * normal) y /entradas/orden/[codigo] (compra por carrito) cuando la compra
 * quedó pendiente de aprobación y no fue gratuita. Si el superadmin todavía
 * no cargó el número (ver /panel/cuenta), el componente no se renderiza —
 * la página que lo usa ya filtra ese caso pasando `numero`. `url` es el link
 * absoluto de la compra (ver lib/url-sitio.ts), que se agrega al mensaje.
 *
 * "Abrir WhatsApp" (wa.me) solo puede llevar TEXTO: WhatsApp no deja adjuntar
 * archivos por ese medio. Por eso, si el comprador subió un comprobante
 * (`urlComprobante`) y su navegador sabe compartir archivos (Web Share API,
 * sobre todo celulares), se ofrece además "Compartir comprobante": abre el menú
 * de compartir con la imagen adjunta y el comprador elige WhatsApp y el contacto.
 */
export function AvisoComprobanteWhatsapp({
  numero,
  codigo,
  url,
  urlComprobante = null,
}: {
  numero: string;
  codigo: string;
  url: string;
  urlComprobante?: string | null;
}) {
  const [copiado, setCopiado] = useState(false);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [errorCompartir, setErrorCompartir] = useState<string | null>(null);
  // El link va en una línea aparte: si el comprador pierde su historial, con él vuelve a su compra.
  const mensaje = `Hola, te mando el comprobante de mi compra ${codigo} en Eike.\n${url}`;

  // Se descarga de antemano (pesa poco, ya viene comprimido) para que el clic en
  // "Compartir" llame a navigator.share sin esperar: el navegador exige que sea
  // casi inmediato al toque del usuario.
  useEffect(() => {
    if (!urlComprobante || typeof navigator.canShare !== "function") return;
    const controlador = new AbortController();
    (async () => {
      try {
        const respuesta = await fetch(urlComprobante, { signal: controlador.signal });
        if (!respuesta.ok) return;
        const blob = await respuesta.blob();
        const extension = blob.type === "application/pdf" ? "pdf" : blob.type.split("/")[1] || "jpg";
        const candidato = new File([blob], `comprobante-${codigo}.${extension}`, { type: blob.type });
        if (navigator.canShare({ files: [candidato] })) setArchivo(candidato);
      } catch {
        // sin red o cancelado: simplemente no se ofrece compartir el archivo
      }
    })();
    return () => controlador.abort();
  }, [urlComprobante, codigo]);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(numero);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // sin permiso de portapapeles: el número sigue visible para copiar a mano
    }
  }

  async function compartir() {
    if (!archivo) return;
    setErrorCompartir(null);
    try {
      await navigator.share({ files: [archivo], text: mensaje });
    } catch (error) {
      // AbortError = el comprador cerró el menú de compartir: no es un fallo.
      if (error instanceof DOMException && error.name === "AbortError") return;
      setErrorCompartir("No se pudo abrir el menú de compartir. Probá con el botón de WhatsApp y adjuntá la foto a mano.");
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
          className="eike-btn eike-btn--amarillo eike-btn--sm"
        >
          Abrir WhatsApp
        </a>
      </div>
      {archivo ? (
        <div className="flex flex-col gap-1.5 border-t border-border-soft pt-3">
          <button type="button" onClick={compartir} className="eike-btn eike-btn--ghost eike-btn--sm self-start">
            Compartir comprobante
          </button>
          <p className="text-[12px] text-muted-dim">
            Abre el menú de compartir con tu comprobante adjunto: elegí WhatsApp y el contacto {numero}.
          </p>
          {errorCompartir ? (
            <p role="alert" className="text-[12px] text-red">
              {errorCompartir}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
