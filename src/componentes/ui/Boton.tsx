import { cn } from "@/lib/cn";

type PropsBoton = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: "cyan" | "ghost";
  tamano?: "normal" | "sm";
};

export function Boton({ variante = "cyan", tamano = "normal", className, ...props }: PropsBoton) {
  return (
    <button
      className={cn(
        "eike-btn",
        variante === "cyan" && "eike-btn--cyan",
        variante === "ghost" && "eike-btn--ghost",
        tamano === "sm" && "eike-btn--sm",
        className,
      )}
      {...props}
    />
  );
}
