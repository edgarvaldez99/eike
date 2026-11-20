import { z } from "zod";
import { zIdPositivo } from "./comun";

export const esquemaResolverDerivacion = z.object({ id: zIdPositivo });

export const esquemaResponderDerivacion = z.object({
  id: zIdPositivo,
  texto: z.string().trim().min(1, "Escribí el mensaje.").max(1000, "Máximo 1000 caracteres."),
});

export const esquemaAsignarComprobante = z.object({
  id: zIdPositivo,
  codigo: z
    .string()
    .trim()
    .regex(/^ORD-[A-Za-z0-9]{6,20}$/, "El código empieza con ORD- (ej. ORD-ABC123DEF456)."),
});
