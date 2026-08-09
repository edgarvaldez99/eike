import { z } from "zod";

/** Checkbox HTML: "on" si está tildado, ausente (undefined) si no. */
export const zCasilla = () =>
  z.preprocess((v) => v === "on" || v === true || v === "true", z.boolean());

/** Campo de texto opcional: '' del formulario se normaliza a null (nunca ""), igual que el PHP. */
export const zTextoOpcional = () =>
  z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null));

export const zIdPositivo = z.coerce.number().int().positive();
