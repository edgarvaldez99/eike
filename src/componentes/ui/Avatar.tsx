import { cn } from "@/lib/cn";
import { iniciales } from "@/lib/formato";

export function Avatar({ nombre, className }: { nombre: string; className?: string }) {
  return <div className={cn("eike-avatar", className)}>{iniciales(nombre)}</div>;
}
