"use client";

import { useId, useRef, useState } from "react";

const ANCHO_MAXIMO = 1600;
const CALIDAD_JPEG = 0.85;

/**
 * Input de archivo con compresión en el cliente ("el conversor" pedido por
 * el tester para imágenes de alta resolución). Antes de que el archivo
 * viaje al servidor, lo redimensiona a un ancho razonable y lo reencodea a
 * JPEG con <canvas> — una foto de celular de 5-6 MB sale como ~300-500 KB,
 * lo que importa con la subida lenta típica de internet móvil.
 *
 * Si el navegador no puede decodificarlo como imagen (es un PDF, o
 * `createImageBitmap` falla) se manda el archivo original tal cual: el
 * servidor (guardarAfiche / prepararComprobante) es quien valida de verdad.
 * Este componente es una optimización de UX, no la validación.
 */
export function CampoImagen({
  etiqueta,
  name,
  required,
  permitirPdf,
  error,
}: {
  etiqueta: string;
  name: string;
  required?: boolean;
  permitirPdf?: boolean;
  error?: string;
}) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [pesoInfo, setPesoInfo] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);

  async function comprimir(archivo: File): Promise<File> {
    if (!archivo.type.startsWith("image/")) return archivo; // ej. PDF del comprobante

    try {
      const bitmap = await createImageBitmap(archivo);
      const escala = Math.min(1, ANCHO_MAXIMO / bitmap.width);
      const ancho = Math.round(bitmap.width * escala);
      const alto = Math.round(bitmap.height * escala);

      const canvas = document.createElement("canvas");
      canvas.width = ancho;
      canvas.height = alto;
      const ctx = canvas.getContext("2d");
      if (!ctx) return archivo;
      ctx.drawImage(bitmap, 0, 0, ancho, alto);
      bitmap.close();

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", CALIDAD_JPEG),
      );
      if (!blob || blob.size >= archivo.size) return archivo; // no valió la pena

      const nombre = archivo.name.replace(/\.\w+$/, "") + ".jpg";
      return new File([blob], nombre, { type: "image/jpeg" });
    } catch {
      return archivo; // no se pudo decodificar en el navegador — que lo valide el servidor
    }
  }

  async function manejarCambio() {
    const input = inputRef.current;
    const archivoOriginal = input?.files?.[0];
    if (!input || !archivoOriginal) {
      setPreview(null);
      setPesoInfo(null);
      return;
    }

    setProcesando(true);
    const pesoOriginal = archivoOriginal.size;
    const comprimido = await comprimir(archivoOriginal);

    if (comprimido !== archivoOriginal) {
      const dt = new DataTransfer();
      dt.items.add(comprimido);
      input.files = dt.files;
    }

    setPreview(comprimido.type.startsWith("image/") ? URL.createObjectURL(comprimido) : null);
    setPesoInfo(
      comprimido.size < pesoOriginal
        ? `${formatoKb(pesoOriginal)} → ${formatoKb(comprimido.size)}`
        : formatoKb(comprimido.size),
    );
    setProcesando(false);
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="eike-campo-label">
        {etiqueta}
      </label>
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element -- preview de un blob: local, recién comprimido, todavía no subido
        <img
          src={preview}
          alt=""
          className="max-h-[220px] w-auto rounded-[var(--radius-eike-sm)] border border-border object-contain"
        />
      ) : null}
      <input
        ref={inputRef}
        id={id}
        type="file"
        name={name}
        required={required}
        accept={
          permitirPdf
            ? "image/png,image/jpeg,image/webp,application/pdf"
            : "image/png,image/jpeg,image/webp"
        }
        onChange={manejarCambio}
        className="text-[12.5px]"
      />
      {procesando ? <p className="text-[12px] text-muted-dim">Optimizando imagen…</p> : null}
      {!procesando && pesoInfo ? <p className="text-[12px] text-muted-dim">{pesoInfo}</p> : null}
      {error ? <p className="eike-campo-error">{error}</p> : null}
    </div>
  );
}

function formatoKb(bytes: number): string {
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
