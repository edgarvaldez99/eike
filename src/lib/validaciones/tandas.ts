import { z } from "zod";
import { TIPOS_TANDA } from "@/lib/constantes";
import { zIdPositivo, zNumeroOpcional } from "./comun";

export const esquemaCrearTanda = z.object({
  evento_id: zIdPositivo,
  nombre: z.string().trim().min(1, "Falta el nombre."),
  tipo: z.enum(TIPOS_TANDA),
  precio: z.coerce.number().int().min(0, "El precio no puede ser negativo."),
  // Solo si tipo=general
  cantidad_total: zNumeroOpcional((s) => s.int().min(1)),
  // Solo si tipo=numerada
  modo_asientos: z.enum(["grilla", "lista"]).optional(),
  filas: zNumeroOpcional((s) => s.int().min(1)),
  asientos_por_fila: zNumeroOpcional((s) => s.int().min(1)),
  // Textarea: identificadores separados por coma o salto de línea.
  identificadores: z.string().trim().optional(),
});

export const esquemaEditarTanda = z.object({
  id: zIdPositivo,
  nombre: z.string().trim().min(1, "Falta el nombre."),
  precio: z.coerce.number().int().min(0, "El precio no puede ser negativo."),
  cantidad_total: zNumeroOpcional((s) => s.int().min(0)),
  estado: z.enum(["activa", "inactiva"]).optional(),
});

export const esquemaEliminarTanda = z.object({ id: zIdPositivo });
