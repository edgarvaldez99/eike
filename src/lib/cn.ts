import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Combina clases condicionales y resuelve conflictos de Tailwind (último gana). */
export function cn(...entradas: ClassValue[]) {
  return twMerge(clsx(entradas));
}
