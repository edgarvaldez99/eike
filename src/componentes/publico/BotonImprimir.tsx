"use client";

import { Boton } from "@/componentes/ui/Boton";

export function BotonImprimir() {
  return (
    <Boton variante="ghost" onClick={() => window.print()}>
      🖨️ Imprimir / Descargar
    </Boton>
  );
}
