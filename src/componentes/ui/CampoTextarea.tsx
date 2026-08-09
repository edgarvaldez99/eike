import { cn } from "@/lib/cn";

type PropsCampoTextarea = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  etiqueta: string;
  error?: string;
};

export function CampoTextarea({ etiqueta, error, id, className, ...props }: PropsCampoTextarea) {
  const idCampo = id ?? props.name;
  return (
    <div>
      <label htmlFor={idCampo} className="eike-campo-label">
        {etiqueta}
      </label>
      <textarea id={idCampo} className={cn("eike-campo-input", className)} {...props} />
      {error ? <p className="eike-campo-error">{error}</p> : null}
    </div>
  );
}
