/**
 * Fuente única de verdad para los dominios que en MariaDB eran ENUM.
 * Cada array alimenta a la vez: el CHECK de Drizzle (db/esquema.ts),
 * el z.enum() de validación (lib/validaciones/*) y el tipo TS.
 * Ver plan de migración §4.2 — se eligió text + CHECK en vez de
 * CREATE TYPE ... AS ENUM nativo de Postgres.
 */

export const ROLES = ["superadmin", "organizador", "staff", "comprador"] as const;
export type Rol = (typeof ROLES)[number];

export const ESTADOS_USUARIO = [
  "pendiente_aprobacion",
  "rechazado",
  "activo",
  "inactivo",
  "mora",
] as const;
export type EstadoUsuario = (typeof ESTADOS_USUARIO)[number];

export const ESTADOS_EVENTO = [
  "borrador",
  "publicado",
  "reprogramado",
  "finalizado",
  "cancelado",
] as const;
export type EstadoEvento = (typeof ESTADOS_EVENTO)[number];

export const APROBACION_GRATUITO = ["no_aplica", "pendiente", "aprobado", "rechazado"] as const;
export type AprobacionGratuito = (typeof APROBACION_GRATUITO)[number];

export const TIPOS_TANDA = ["general", "numerada"] as const;
export type TipoTanda = (typeof TIPOS_TANDA)[number];

export const ESTADOS_TANDA = ["activa", "agotada", "inactiva"] as const;
export type EstadoTanda = (typeof ESTADOS_TANDA)[number];

export const ESTADOS_ASIENTO = ["disponible", "reservado", "vendido"] as const;
export type EstadoAsiento = (typeof ESTADOS_ASIENTO)[number];

export const ESTADOS_TICKET = ["pendiente", "disponible", "usado", "anulado"] as const;
export type EstadoTicket = (typeof ESTADOS_TICKET)[number];

export const METODOS_PAGO = ["transferencia", "tarjeta", "billetera"] as const;
export type MetodoPago = (typeof METODOS_PAGO)[number];

export const ESTADOS_PAGO = ["pendiente", "pagado", "rechazado"] as const;
export type EstadoPago = (typeof ESTADOS_PAGO)[number];

export const ESTADOS_SUSCRIPCION = ["activa", "mora", "cancelada"] as const;
export type EstadoSuscripcion = (typeof ESTADOS_SUSCRIPCION)[number];

export const ESTADOS_LIQUIDACION = ["pendiente", "liquidado"] as const;
export type EstadoLiquidacion = (typeof ESTADOS_LIQUIDACION)[number];

export const ESTADOS_REEMBOLSO = ["solicitado", "autorizado", "procesado"] as const;
export type EstadoReembolso = (typeof ESTADOS_REEMBOLSO)[number];

/** Estados de usuarios.estado que NO pueden iniciar sesión (ver auth.php::motivoBloqueoLogin). */
export const MOTIVOS_BLOQUEO_LOGIN: Partial<Record<EstadoUsuario, string>> = {
  pendiente_aprobacion: "Tu cuenta todavía está pendiente de aprobación.",
  rechazado: "Tu solicitud de alta fue rechazada. Revisá el motivo enviado por email.",
  inactivo: "Tu cuenta está inactiva.",
};

export const ZONA_HORARIA = "America/Asuncion";
