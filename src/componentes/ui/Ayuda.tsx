/**
 * Ayuda en línea enfocable por teclado — reemplaza el patrón
 * <span title="..."> (sin nombre accesible, sin foco) por un <details>
 * nativo: abre con click o Enter/Espacio, sin JS propio.
 */
export function Ayuda({ children }: { children: React.ReactNode }) {
  return (
    <details className="eike-ayuda">
      <summary className="eike-help" aria-label="Ayuda">
        ?
      </summary>
      <div className="eike-ayuda-texto">{children}</div>
    </details>
  );
}
