"use client";

import { useEffect, useRef } from "react";

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
      className="w-full max-w-md rounded-[var(--radius-eike)] border border-border bg-surface p-0 text-text backdrop:bg-black/60"
    >
      <div className="flex items-center justify-between border-b border-border-soft p-4">
        <h2 className="font-bold">{titulo}</h2>
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar"
          className="text-muted hover:text-text"
        >
          ✕
        </button>
      </div>
      <div className="p-4">{children}</div>
    </dialog>
  );
}
