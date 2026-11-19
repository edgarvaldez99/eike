"use client";

import { useState } from "react";
import { CampoTexto } from "@/componentes/ui/CampoTexto";
import { normalizarTelefonoPy } from "@/lib/telefono";

/**
 * Número de WhatsApp escrito dos veces. El segundo campo no admite pegar ni
 * arrastrar texto, así que hay que tipearlo a mano: evita cargar un número
 * equivocado por un error de copiado. Es una ayuda de UX; el servidor
 * revalida que sean iguales (exigirContactoConfirmado).
 */
export function CampoWhatsappConfirmado({ valorInicial = "", error }: { valorInicial?: string; error?: string }) {
  const [numero, setNumero] = useState(valorInicial);
  const [confirmacion, setConfirmacion] = useState("");

  const confirmado = confirmacion.trim() !== "";
  const noCoincide = confirmado && normalizarTelefonoPy(confirmacion) !== normalizarTelefonoPy(numero);

  return (
    <div className="flex flex-col gap-4">
      <CampoTexto
        etiqueta="Número de WhatsApp (te avisamos ahí cuando se confirme)"
        name="contacto"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        required
        placeholder="0981 123 456"
        value={numero}
        onChange={(e) => setNumero(e.target.value)}
        error={error}
      />
      <CampoTexto
        etiqueta="Repetí tu número de WhatsApp (escribilo, no se puede pegar)"
        name="contacto_confirmacion"
        type="tel"
        inputMode="tel"
        autoComplete="off"
        required
        placeholder="0981 123 456"
        value={confirmacion}
        onChange={(e) => setConfirmacion(e.target.value)}
        onPaste={(e) => e.preventDefault()}
        onDrop={(e) => e.preventDefault()}
        onBeforeInput={(e) => {
          const tipo = (e.nativeEvent as InputEvent).inputType;
          if (tipo === "insertFromPaste" || tipo === "insertFromDrop") e.preventDefault();
        }}
        error={noCoincide ? "Los números no coinciden." : undefined}
      />
    </div>
  );
}
