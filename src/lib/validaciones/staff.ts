import { z } from "zod";
import { zIdPositivo } from "./comun";

export const esquemaInvitarStaff = z.object({ evento_id: zIdPositivo });
export const esquemaAsignarStaff = z.object({ staff_id: zIdPositivo, evento_id: zIdPositivo });
export const esquemaQuitarStaffDeEvento = z.object({ staff_id: zIdPositivo, evento_id: zIdPositivo });
export const esquemaStaffId = z.object({ staff_id: zIdPositivo });

export const esquemaAceptarInvitacion = z.object({
  token: z.string().trim().min(1),
  nombre: z.string().trim().min(1, "Falta tu nombre."),
  email: z.email("Ese email no parece válido."),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres."),
});
