"use client";

import { useEffect } from "react";

/**
 * `confirm()` nativo del navegador al cerrar la pestaña o recargar con
 * cambios sin guardar. No cubre una navegación interna de Next (Link/router
 * — `beforeunload` no dispara ahí, limitación de la API); cubre el caso más
 * común en un formulario largo del panel: cerrar la pestaña por error.
 */
export function useAvisoCambiosSinGuardar(sucio: boolean) {
  useEffect(() => {
    if (!sucio) return;
    function manejar(e: BeforeUnloadEvent) {
      e.preventDefault();
    }
    window.addEventListener("beforeunload", manejar);
    return () => window.removeEventListener("beforeunload", manejar);
  }, [sucio]);
}
