"use client";

import { useCallback, useSyncExternalStore } from "react";

export type Tema = "claro" | "oscuro" | "sistema";

const CLAVE = "eike-tema";
const COLOR_POR_ESQUEMA: Record<"light" | "dark", string> = {
  light: "#f7f8fa",
  dark: "#10141a",
};

const listeners = new Set<() => void>();

function suscribirse(avisar: () => void) {
  listeners.add(avisar);
  return () => listeners.delete(avisar);
}

function leerTema(): Tema {
  const guardado = localStorage.getItem(CLAVE);
  return guardado === "light" ? "claro" : guardado === "dark" ? "oscuro" : "sistema";
}

// En el servidor (sin localStorage) el tema "visible" siempre es "sistema" —
// el script no-FOUC de src/app/layout.tsx ya corrigió el data-theme real del
// <html> antes de que React hidrate, así que esto solo evita el mismatch de
// hidratación, no produce un flash.
function leerTemaServidor(): Tema {
  return "sistema";
}

function esquemaResuelto(tema: Tema): "light" | "dark" {
  if (tema === "claro") return "light";
  if (tema === "oscuro") return "dark";
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function aplicar(tema: Tema) {
  const html = document.documentElement;
  if (tema === "sistema") {
    html.removeAttribute("data-theme");
    localStorage.removeItem(CLAVE);
  } else {
    const valor = esquemaResuelto(tema);
    html.setAttribute("data-theme", valor);
    localStorage.setItem(CLAVE, valor);
  }
  // El <meta name="theme-color"> con @media (en viewport, src/app/layout.tsx)
  // solo reacciona a la preferencia del SISTEMA — al forzar un tema a mano
  // hay que empujar el color correcto nosotros mismos.
  const color = COLOR_POR_ESQUEMA[esquemaResuelto(tema)];
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
    meta.setAttribute("content", color);
  });
  listeners.forEach((avisar) => avisar());
}

export function useTema() {
  const tema = useSyncExternalStore(suscribirse, leerTema, leerTemaServidor);
  const setTema = useCallback((siguiente: Tema) => aplicar(siguiente), []);
  return { tema, setTema };
}
