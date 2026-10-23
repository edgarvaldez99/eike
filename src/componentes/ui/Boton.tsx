import { cn } from "@/lib/cn";

type PropsBoton = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: "amarillo" | "lila" | "ghost";
  tamano?: "normal" | "sm";
};

export function Boton({ variante = "amarillo", tamano = "normal", className, ...props }: PropsBoton) {
  return (
    <button
      className={cn(
        "eike-btn",
        variante === "amarillo" && "eike-btn--amarillo",
        variante === "lila" && "eike-btn--lila",
        variante === "ghost" && "eike-btn--ghost",
        tamano === "sm" && "eike-btn--sm",
        className,
      )}
      {...props}
    />
  );
}
