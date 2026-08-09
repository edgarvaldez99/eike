import { z } from "zod";
import { zCasilla, zIdOpcional, zIdPositivo, zTextoOpcional } from "./comun";

export const esquemaAprobarRechazarTicket = z.object({ id: zIdPositivo });

export const esquemaComprar = z.object({
  evento_id: zIdPositivo,
  tanda_id: zIdPositivo,
  nombre_comprador: z.string().trim().min(1, "Falta el nombre."),
  cedula: zTextoOpcional(),
  email: z.email("Ese email no parece válido."),
  contacto: zTextoOpcional(),
  // Solo se manda si la tanda es numerada y hay comprador logueado (campo
  // condicional del form — cuando no se renderiza, FormData.get() devuelve
  // null, no undefined; zIdOpcional() ya contempla ese caso).
  asiento_id: zIdOpcional(),
  tyc_aceptado: zCasilla(),
  comprobante_texto: zTextoOpcional(),
});

export const esquemaCrearCortesia = z.object({
  tanda_id: zIdPositivo,
  nombre_comprador: z.string().trim().min(1, "Falta el nombre del invitado."),
  email: z.email("Ese email no parece válido."),
  cedula: zTextoOpcional(),
  contacto: zTextoOpcional(),
});
