"use client";

import { Boton } from "@/componentes/ui/Boton";
import { Icono } from "@/componentes/ui/Icono";

export function BotonImprimir() {
  return (
    <Boton variante="ghost" onClick={() => window.print()}>
      <Icono nombre="imprimir" /> Imprimir / Descargar
    </Boton>
  );
}
