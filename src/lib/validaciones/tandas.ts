import { z } from "zod";
import { TIPOS_TANDA } from "@/lib/constantes";
import { zIdPositivo } from "./comun";

export const esquemaCrearTanda = z.object({
  evento_id: zIdPositivo,
  nombre: z.string().trim().min(1, "Falta el nombre."),
  tipo: z.enum(TIPOS_TANDA),
  precio: z.coerce.number().int().min(0, "El precio no puede ser negativo."),
  // Solo si tipo=general
  cantidad_total: z.preprocess(
    (v) => (v === "" || v === undefined ? undefined : v),
    z.coerce.number().int().min(1).optional(),
  ),
  // Solo si tipo=numerada
  modo_asientos: z.enum(["grilla", "lista"]).optional(),
  filas: z.preprocess(
    (v) => (v === "" || v === undefined ? undefined : v),
    z.coerce.number().int().min(1).optional(),
  ),
  asientos_por_fila: z.preprocess(
    (v) => (v === "" || v === undefined ? undefined : v),
    z.coerce.number().int().min(1).optional(),
  ),
  // Textarea: identificadores separados por coma o salto de línea.
  identificadores: z.string().trim().optional(),
});

export const esquemaEditarTanda = z.object({
  id: zIdPositivo,
  nombre: z.string().trim().min(1, "Falta el nombre."),
  precio: z.coerce.number().int().min(0, "El precio no puede ser negativo."),
  cantidad_total: z.preprocess(
    (v) => (v === "" || v === undefined ? undefined : v),
    z.coerce.number().int().min(0).optional(),
  ),
  estado: z.enum(["activa", "inactiva"]).optional(),
});

export const esquemaEliminarTanda = z.object({ id: zIdPositivo });
