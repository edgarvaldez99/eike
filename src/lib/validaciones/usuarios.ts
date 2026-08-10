import { z } from "zod";
import { zCasilla, zIdPositivo, zTextoOpcional } from "./comun";

export const esquemaRegistroComprador = z.object({
  nombre: z.string().trim().min(1, "Falta el nombre."),
  email: z.email("Ese email no parece válido."),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres."),
  telefono: zTextoOpcional(),
  cedula: zTextoOpcional(),
  tyc_aceptado: zCasilla(),
});

// ---------------------------------------------------------------------------
// Gestión de organizadores (superadmin)
// ---------------------------------------------------------------------------
export const esquemaOrganizadorId = z.object({ id: zIdPositivo });

export const esquemaRechazarOrganizador = z.object({
  id: zIdPositivo,
  motivo: z.string().trim().min(1, "Falta el motivo del rechazo."),
});

export const esquemaEditarOrganizador = z.object({
  id: zIdPositivo,
  nombre: z.string().trim().min(1, "Falta el nombre."),
  telefono: zTextoOpcional(),
  ruc_facturacion: zTextoOpcional(),
});
