import { z } from "zod";
import { zIdPositivo, zTextoOpcional } from "./comun";

export const esquemaAprobarRechazarTicket = z.object({ id: zIdPositivo });

export const esquemaCrearCortesia = z.object({
  tanda_id: zIdPositivo,
  nombre_comprador: z.string().trim().min(1, "Falta el nombre del invitado."),
  email: z.email("Ese email no parece válido."),
  cedula: zTextoOpcional(),
  contacto: zTextoOpcional(),
});
