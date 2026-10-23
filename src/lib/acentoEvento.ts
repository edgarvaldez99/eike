export type AcentoEvento = "lila" | "amarillo";

/**
 * Determinístico por id (no por posición en una lista): la tarjeta en la
 * grilla, el póster del detalle y el botón "Comprar" de un mismo evento
 * siempre coinciden, sin importar en qué listado aparezca.
 */
export function acentoEvento(eventoId: number): AcentoEvento {
  return eventoId % 2 === 0 ? "amarillo" : "lila";
}

/**
 * El mockup usa el acento contrario al del borde del ticket para el botón
 * "Comprar" de ese mismo evento (ticket amarillo → botón lila, y viceversa).
 */
export function acentoOpuesto(acento: AcentoEvento): AcentoEvento {
  return acento === "amarillo" ? "lila" : "amarillo";
}
