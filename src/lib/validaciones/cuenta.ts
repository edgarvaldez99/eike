import { z } from "zod";
import { TIPOS_ALIAS_BANCARIO } from "@/lib/constantes";
import { zTextoOpcional } from "./comun";

/** Autoedición de perfil — cualquier usuario logueado edita SUS PROPIOS
 * datos (sin roles, ver lib/acciones/cuenta.ts). */
export const esquemaEditarPerfil = z.object({
  nombre: z.string().trim().min(1, "Falta el nombre."),
  email: z.email("Ese email no parece válido."),
  telefono: zTextoOpcional(),
  cedula: zTextoOpcional(),
});

export const esquemaCambiarPassword = z
  .object({
    password_actual: z.string().min(1, "Ingresá tu contraseña actual."),
    password_nueva: z.string().min(8, "La contraseña nueva debe tener al menos 8 caracteres."),
    password_confirmar: z.string().min(1, "Confirmá la contraseña nueva."),
  })
  .refine((datos) => datos.password_nueva === datos.password_confirmar, {
    message: "Las contraseñas nuevas no coinciden.",
    path: ["password_confirmar"],
  });

/** Solo superadmin — dato de la plataforma (ver constantes.ts), no de cada organizador. */
export const esquemaEditarAliasBancario = z.object({
  alias_bancario_tipo: z.enum(TIPOS_ALIAS_BANCARIO),
  alias_bancario_valor: z.string().trim().min(1, "Falta el valor del alias."),
});
