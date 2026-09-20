"use client";

import { useEffect, useId, useRef } from "react";
import { Icono } from "@/componentes/ui/Icono";

export function Modal({
  titulo,
  abierto,
  onCerrar,
  children,
}: {
  titulo: string;
  abierto: boolean;
  onCerrar: () => void;
  children: React.ReactNode;
}) {
  const refDialog = useRef<HTMLDialogElement>(null);
  const idTitulo = useId();

  useEffect(() => {
    const dialog = refDialog.current;
    if (!dialog) return;
    if (abierto && !dialog.open) dialog.showModal();
    if (!abierto && dialog.open) dialog.close();
  }, [abierto]);

  return (
    <dialog
      ref={refDialog}
      onClose={onCerrar}
      onCancel={onCerrar}
      aria-labelledby={idTitulo}
      className="w-full max-w-md overscroll-contain rounded-[var(--radius-eike)] border border-border bg-surface p-0 text-text backdrop:bg-black/60"
    >
      <div className="flex items-center justify-between border-b border-border-soft p-4">
        <h2 id={idTitulo} className="font-bold">
          {titulo}
        </h2>
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar"
          className="eike-btn eike-btn--ghost eike-btn--sm eike-btn--icono"
        >
          <Icono nombre="cerrar" />
        </button>
      </div>
      <div className="p-4">{children}</div>
    </dialog>
  );
}
