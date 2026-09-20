import type { ResultadoAccion } from "@/lib/acciones/marco";

/** Mensaje de error de UN campo puntual, para pasar a Campo*'s prop `error`. */
export function errorCampo(estado: ResultadoAccion<unknown> | null, campo: string): string | undefined {
  return estado && !estado.ok ? estado.campos?.[campo] : undefined;
}

/**
 * Mensaje global para <AvisoError>, o undefined si no hay nada que mostrar.
 * Se arma siempre que `!estado.ok` (no solo cuando `!estado.campos`) e
 * incluye como fallback cualquier campo de `estado.campos` que ningún
 * `<CampoTexto error=...>` del formulario consuma — ver marco.ts: `campos`
 * se puebla ante CUALQUIER fallo de validación de Zod, no solo los que un
 * formulario decidió cablear inline. Sin esto, ese fallo desaparece en
 * silencio (bug real detectado en el flujo de compra).
 */
export function mensajeError(
  estado: ResultadoAccion<unknown> | null,
  camposMostrados: string[] = [],
): string | undefined {
  if (!estado || estado.ok) return undefined;
  const sinMostrar = estado.campos
    ? Object.entries(estado.campos)
        .filter(([campo]) => !camposMostrados.includes(campo))
        .map(([, mensaje]) => mensaje)
    : [];
  return [estado.error, ...sinMostrar].join(" ");
}
