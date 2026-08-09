import { z } from "zod";
import { zCasilla, zTextoOpcional } from "./comun";

export const esquemaRegistroComprador = z.object({
  nombre: z.string().trim().min(1, "Falta el nombre."),
  email: z.email("Ese email no parece válido."),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres."),
  telefono: zTextoOpcional(),
  cedula: zTextoOpcional(),
  tyc_aceptado: zCasilla(),
});
