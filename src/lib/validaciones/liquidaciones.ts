import { z } from "zod";
import { zIdPositivo } from "./comun";

export const esquemaCrearLiquidacion = z.object({
  organizador_id: zIdPositivo,
  periodo_inicio: z.string().trim().min(1, "Falta el período de inicio."),
  periodo_fin: z.string().trim().min(1, "Falta el período de fin."),
  total_vendido: z.coerce.number().int().min(0, "No puede ser negativo."),
  monto_comision_o_suscripcion: z.coerce.number().int().min(0, "No puede ser negativo."),
});
