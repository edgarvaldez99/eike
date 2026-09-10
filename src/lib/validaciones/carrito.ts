import { z } from "zod";
import { zCasilla, zIdOpcional, zIdPositivo, zTextoOpcional } from "./comun";

// Fase 6 del plan de mejoras — carrito con reserva real.

export const esquemaAgregarAlCarrito = z.object({
  tanda_id: zIdPositivo,
  cantidad: z.coerce.number().int().min(1).max(20).default(1),
  // Solo para tanda numerada, cuando se elige un asiento puntual (ver
  // BotonAgregarCarrito) — si se manda, cantidad tiene que ser 1.
  asiento_id: zIdOpcional(),
});

export const esquemaActualizarCantidadCarrito = z.object({
  // id de carrito_items, no de la tanda: una tanda numerada puede tener
  // varias filas (una por asiento pineado) — ver server/carrito.ts.
  item_id: zIdPositivo,
  // 0 = sacar el ítem del carrito (ver server/carrito.ts::actualizarCantidadItemCarrito).
  cantidad: z.coerce.number().int().min(0).max(20),
});

export const esquemaQuitarDelCarrito = z.object({
  item_id: zIdPositivo,
});

export const esquemaPrevisualizarCuponCarrito = z.object({
  codigo: z.string().trim().min(1, "Falta el código."),
});

export const esquemaCheckoutCarrito = z.object({
  nombre_comprador: z.string().trim().min(1, "Falta el nombre."),
  cedula: zTextoOpcional(),
  email: z.email("Ese email no parece válido."),
  contacto: zTextoOpcional(),
  tyc_aceptado: zCasilla(),
  comprobante_texto: zTextoOpcional(),
  codigo_cupon: zTextoOpcional(),
});
