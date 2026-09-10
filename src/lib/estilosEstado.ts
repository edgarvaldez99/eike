import type { EstadoEvento, EstadoTanda, EstadoTicket, EstadoUsuario } from "@/lib/constantes";

type VariantePill = "ok" | "warn" | "err" | "info" | "neutral";

export const PILL_ESTADO_EVENTO: Record<EstadoEvento, VariantePill> = {
  borrador: "neutral",
  pendiente_aprobacion: "warn",
  publicado: "ok",
  rechazado: "err",
  reprogramado: "warn",
  finalizado: "info",
  cancelado: "err",
};

export const PILL_ESTADO_TICKET: Record<EstadoTicket, VariantePill> = {
  pendiente: "warn",
  disponible: "ok",
  usado: "info",
  anulado: "err",
};

export const PILL_ESTADO_TANDA: Record<EstadoTanda, VariantePill> = {
  activa: "ok",
  agotada: "warn",
  inactiva: "neutral",
};

export const PILL_ESTADO_USUARIO: Record<EstadoUsuario, VariantePill> = {
  pendiente_aprobacion: "warn",
  rechazado: "err",
  activo: "ok",
  inactivo: "neutral",
  mora: "warn",
};
