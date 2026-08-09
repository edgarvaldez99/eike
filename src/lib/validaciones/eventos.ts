import { z } from "zod";
import { zCasilla, zIdPositivo, zNumeroOpcional, zTextoOpcional } from "./comun";

export const esquemaCrearEvento = z.object({
  nombre: z.string().trim().min(1, "Falta el nombre."),
  descripcion: zTextoOpcional(),
  fecha_evento: z.string().trim().min(1, "Falta la fecha."),
  lugar: zTextoOpcional(),
  aforo_total: zNumeroOpcional((s) => s.int().min(0)),
  es_gratuito: zCasilla(),
});

export const esquemaEditarEvento = z.object({
  id: zIdPositivo,
  nombre: z.string().trim().min(1, "Falta el nombre."),
  descripcion: zTextoOpcional(),
  fecha_evento: z.string().trim().min(1, "Falta la fecha."),
  lugar: zTextoOpcional(),
  aforo_total: zNumeroOpcional((s) => s.int().min(0)),
});

export const esquemaPublicarEvento = z.object({ id: zIdPositivo });
