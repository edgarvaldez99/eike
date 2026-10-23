"use client";

import { useTema, type Tema } from "@/lib/hooks/useTema";
import { Icono, type NombreIcono } from "@/componentes/ui/Icono";

const SIGUIENTE: Record<Tema, Tema> = {
  sistema: "claro",
  claro: "oscuro",
  oscuro: "sistema",
};

const GLIFO: Record<Tema, NombreIcono> = {
  sistema: "monitor",
  claro: "sol",
  oscuro: "luna",
};

const ETIQUETA: Record<Tema, string> = {
  sistema: "Tema: según el sistema",
  claro: "Tema: claro",
  oscuro: "Tema: oscuro",
};

export function SwitcherTema() {
  const { tema, setTema } = useTema();

  return (
    <button
      type="button"
      onClick={() => setTema(SIGUIENTE[tema])}
      className="eike-btn eike-btn--ghost eike-btn--sm eike-btn--icono"
      aria-label={`${ETIQUETA[tema]} — tocar para cambiar`}
    >
      <Icono nombre={GLIFO[tema]} />
    </button>
  );
}
