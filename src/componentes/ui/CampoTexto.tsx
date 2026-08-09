import { cn } from "@/lib/cn";

type PropsCampoTexto = React.InputHTMLAttributes<HTMLInputElement> & {
  etiqueta: string;
  error?: string;
};

export function CampoTexto({ etiqueta, error, id, className, ...props }: PropsCampoTexto) {
  const idCampo = id ?? props.name;
  return (
    <div>
      <label htmlFor={idCampo} className="eike-campo-label">
        {etiqueta}
      </label>
      <input id={idCampo} className={cn("eike-campo-input", className)} {...props} />
      {error ? <p className="eike-campo-error">{error}</p> : null}
    </div>
  );
}
