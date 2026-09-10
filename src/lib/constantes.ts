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

// "pendiente_aprobacion" y "rechazado" — aprobación de eventos por
// superadmin (pedido explícito, anti-estafa): un organizador ya no publica
// directo, solicita aprobación y el evento queda de solo lectura hasta que
// el superadmin lo aprueba (→ publicado) o lo rechaza (→ rechazado, vuelve
// a ser editable). Reemplaza/supera a aprobacionGratuito de abajo, que
// nunca llegó a tener una UI real (ver server/eventos.ts).
export const ESTADOS_EVENTO = [
  "borrador",
  "pendiente_aprobacion",
  "publicado",
  "rechazado",
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

// Fase 5 del plan de mejoras (Cambios_web.txt) — unidad de aprobación/pago.
// Hoy sigue siendo 1:1 con un ticket, pero es el prerrequisito estructural
// del carrito (Fase 6): una orden con N tickets se aprueba/rechaza entera.
export const ESTADOS_ORDEN = ["pendiente", "pagada", "rechazada", "vencida"] as const;
export type EstadoOrden = (typeof ESTADOS_ORDEN)[number];

// Fase 7 del plan de mejoras — cupones de descuento del organizador.
export const TIPOS_CUPON = ["porcentaje", "monto"] as const;
export type TipoCupon = (typeof TIPOS_CUPON)[number];

// Fase 8 del plan de mejoras — código de vendedor/referido y premios por compartir.
export const ESTADOS_VENTA_REFERIDA = ["pendiente", "valida", "anulada"] as const;
export type EstadoVentaReferida = (typeof ESTADOS_VENTA_REFERIDA)[number];

// v1: solo cortesía (una entrada gratis) como premio.
export const TIPOS_PREMIO = ["cortesia"] as const;
export type TipoPremio = (typeof TIPOS_PREMIO)[number];

export const ESTADOS_PREMIO = ["otorgado", "pendiente_stock", "entregado", "anulado"] as const;
export type EstadoPremio = (typeof ESTADOS_PREMIO)[number];

// Ventana de atribución del link ?ref=: cuánto dura la cookie desde el clic.
export const DIAS_ATRIBUCION_REFERIDO = 30;

// Fase 6 del plan de mejoras — carrito con reserva real. Solo 3 estados:
// no hace falta un 'en_checkout' separado porque el checkout es una única
// transacción atómica (el carrito queda bloqueado por su propio FOR UPDATE
// mientras dura, ver server/carrito.ts) — nunca queda observable "a medio
// camino" para otro request.
export const ESTADOS_CARRITO = ["activo", "completado", "vencido"] as const;
export type EstadoCarrito = (typeof ESTADOS_CARRITO)[number];

// Temporizador de reserva del carrito: sliding window con techo duro (ver
// server/carrito.ts::calcularExpiracionCarrito). Deliberadamente corto (a
// diferencia de las 48h de una orden pendiente, HORAS_RESERVA en
// server/tickets.ts): acá el comprador todavía está decidiendo, no
// esperando que el organizador verifique una transferencia ya hecha.
export const MINUTOS_CARRITO_SLIDING = 15;
export const MINUTOS_CARRITO_MAXIMO = 60;

// Alias bancario del superadmin — dato de LA PLATAFORMA (no de cada
// organizador), para el mensaje de WhatsApp que se le manda a mano al
// comprador con las instrucciones de dónde transferir. En Paraguay el
// alias interbancario (SIPAP) se identifica por uno de estos 4 tipos.
export const TIPOS_ALIAS_BANCARIO = ["ruc", "cedula", "telefono", "correo"] as const;
export type TipoAliasBancario = (typeof TIPOS_ALIAS_BANCARIO)[number];

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
