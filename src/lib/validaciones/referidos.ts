import { z } from "zod";
import { zIdOpcional, zIdPositivo, zNumeroOpcional } from "./comun";

export const esquemaCrearPrograma = z.object({
  // "" (radio "todos mis eventos") normaliza a undefined vía zIdOpcional.
  evento_id: zIdOpcional(),
  nombre: z.string().trim().min(1, "Falta el nombre.").max(80, "El nombre es demasiado largo."),
  ventas_requeridas: z.coerce.number().int().min(1, "Tiene que ser al menos 1."),
  tanda_premio_id: zIdPositivo,
  max_premios_por_usuario: zNumeroOpcional((s) => s.int().positive()),
  monto_minimo_venta: zNumeroOpcional((s) => s.int().min(0)),
});

export const esquemaCambiarEstadoPrograma = z.object({
  id: zIdPositivo,
  activo: z.enum(["true", "false"]).transform((v) => v === "true"),
});
