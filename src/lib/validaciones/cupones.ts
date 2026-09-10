import { z } from "zod";
import { TIPOS_CUPON } from "@/lib/constantes";
import { zIdOpcional, zIdPositivo, zNumeroOpcional, zTextoOpcional } from "./comun";

export const esquemaCrearCupon = z.object({
  // "" (radio "todos mis eventos") normaliza a undefined vía zIdOpcional.
  evento_id: zIdOpcional(),
  codigo: z
    .string()
    .trim()
    .min(3, "El código tiene que tener al menos 3 caracteres.")
    .max(40, "El código es demasiado largo.")
    .transform((v) => v.toUpperCase()),
  tipo: z.enum(TIPOS_CUPON),
  valor: z.coerce.number().int().positive("El valor tiene que ser mayor a 0."),
  max_usos: zNumeroOpcional((s) => s.int().positive()),
  max_usos_por_comprador: zNumeroOpcional((s) => s.int().positive()),
  monto_minimo: zNumeroOpcional((s) => s.int().min(0)),
  vence_en: zTextoOpcional(),
});

export const esquemaCambiarEstadoCupon = z.object({
  id: zIdPositivo,
  activo: z.enum(["true", "false"]).transform((v) => v === "true"),
});

export const esquemaPrevisualizarCupon = z.object({
  evento_id: zIdPositivo,
  tanda_id: zIdPositivo,
  codigo: z.string().trim().min(1, "Falta el código."),
});
