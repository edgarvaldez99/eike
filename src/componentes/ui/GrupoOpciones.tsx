import { cn } from "@/lib/cn";

/**
 * fieldset/legend real para un grupo de radios — reemplaza el patrón
 * <span className="eike-campo-label"> + <div> suelto, que muestra el texto
 * pero no lo asocia con el grupo para un lector de pantalla.
 */
export function GrupoOpciones({
  etiqueta,
  children,
  className,
}: {
  etiqueta: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <fieldset className={cn("m-0 min-w-0 border-0 p-0", className)}>
      <legend className="eike-campo-label p-0">{etiqueta}</legend>
      {children}
    </fieldset>
  );
}
