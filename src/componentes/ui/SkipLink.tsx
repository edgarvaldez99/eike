/**
 * Primer tabstop de cada layout — hoy el primero es la topbar de 5
 * controles. Invisible hasta que recibe foco por teclado (patrón estándar,
 * sin JS: `sr-only` + `focus:not-sr-only`).
 */
export function SkipLink({ destino }: { destino: string }) {
  return (
    <a
      href={destino}
      className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-[var(--radius-eike-sm)] focus:bg-cyan focus:px-4 focus:py-2 focus:text-[#04222b] focus:font-bold"
    >
      Saltar al contenido
    </a>
  );
}
