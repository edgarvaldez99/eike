import { z } from "zod";

/**
 * `FormData.get(clave)` devuelve `null` cuando la clave no está presente en
 * absoluto (ej. un campo condicional que no se renderizó), no `undefined`.
 * Todos los preprocess de campos opcionales tienen que contemplar los tres
 * casos (null, undefined, "") como "no se mandó nada" — si solo se
 * contemplan dos, un campo ausente pasa crudo al validador de abajo y lo
 * rechaza con un error confuso (ver bug real: asiento_id en esquemaComprar).
 */
function normalizarAusente(v: unknown): unknown {
  return v === null || v === undefined || v === "" ? undefined : v;
}

/** Checkbox HTML: "on" si está tildado, ausente/null/"" si no. */
export const zCasilla = () =>
  z.preprocess((v) => v === "on" || v === true || v === "true", z.boolean());

/** Campo de texto opcional: vacío/ausente se normaliza a null (nunca ""), igual que el PHP. */
export const zTextoOpcional = () =>
  z
    .preprocess(normalizarAusente, z.string().trim().optional())
    .transform((v) => (v && v.length > 0 ? v : null));

/** Campo numérico opcional (aforo_total, cantidad_total, asiento_id, etc.). */
export const zNumeroOpcional = (extra?: (schema: z.ZodNumber) => z.ZodNumber) =>
  z.preprocess(
    normalizarAusente,
    (extra ? extra(z.coerce.number()) : z.coerce.number()).optional(),
  );

export const zIdPositivo = z.coerce.number().int().positive();

export const zIdOpcional = () => zNumeroOpcional((s) => s.int().positive());
