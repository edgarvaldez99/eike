import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/cliente";
import { cupones, cuponUsos, eventos, tandas } from "@/db/esquema";
import { ErrorNegocio } from "@/lib/errores";
import { formatoGs } from "@/lib/formato";
import type { TipoCupon } from "@/lib/constantes";
import type { UsuarioSesion } from "@/lib/auth/sesion";

type Ejecutor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Calcula el descuento sobre un subtotal, siempre acotado a no superar el
 * subtotal (un cupón nunca puede dejar un total negativo). Exportada: la
 * usa también server/carrito.ts (Fase 6) para la versión multi-ítem. */
export function calcularDescuento(cupon: { tipo: TipoCupon; valor: number }, subtotal: number): number {
  if (cupon.tipo === "porcentaje") {
    return Math.min(subtotal, Math.floor((subtotal * cupon.valor) / 100));
  }
  return Math.min(subtotal, cupon.valor);
}

/**
 * Busca el cupón por código y valida que sea aplicable a este evento/monto —
 * SIN consumirlo (no toca `usos`). Usado tanto por la previsualización
 * (solo lectura) como por el consumo real (que además hace el UPDATE
 * atómico de abajo). Tirar acá adelante de cualquier UPDATE es a propósito:
 * un cupón inválido nunca debería ni intentar consumirse.
 */
async function buscarCuponAplicable(
  ejecutor: Ejecutor,
  datos: { codigo: string; organizadorId: number; eventoId: number; subtotal: number },
): Promise<typeof cupones.$inferSelect> {
  const [cupon] = await ejecutor
    .select()
    .from(cupones)
    .where(sql`lower(${cupones.codigo}) = lower(${datos.codigo})`)
    .limit(1);
  if (!cupon) throw new ErrorNegocio("Ese cupón no existe.");
  if (!cupon.activo) throw new ErrorNegocio("Ese cupón ya no está activo.");
  if (cupon.venceEn && cupon.venceEn.getTime() <= Date.now()) {
    throw new ErrorNegocio("Ese cupón venció.");
  }
  // Alcance: del organizador de ESTE evento, y (todos sus eventos, o este en particular).
  if (cupon.organizadorId !== datos.organizadorId || (cupon.eventoId !== null && cupon.eventoId !== datos.eventoId)) {
    throw new ErrorNegocio("Ese cupón no es válido para este evento.");
  }
  if (datos.subtotal < cupon.montoMinimo) {
    throw new ErrorNegocio(`Ese cupón requiere una compra de al menos ${formatoGs(cupon.montoMinimo)}.`);
  }
  return cupon;
}

export interface PreviaCupon {
  descuento: number;
  total: number;
}

/** Solo lectura, para mostrar el total antes de transferir — no consume el
 * cupón. El consumo real (y el chequeo atómico de cupo) ocurre recién
 * dentro de la transacción de la compra, ver consumirCupon(). */
export async function previsualizarCupon(datos: {
  eventoId: number;
  tandaId: number;
  codigo: string;
}): Promise<PreviaCupon> {
  const [tanda] = await db.select().from(tandas).where(eq(tandas.id, datos.tandaId)).limit(1);
  if (!tanda || tanda.eventoId !== datos.eventoId) throw new ErrorNegocio("Tanda no encontrada.");
  const [evento] = await db.select().from(eventos).where(eq(eventos.id, datos.eventoId)).limit(1);
  if (!evento) throw new ErrorNegocio("Evento no encontrado.");

  const cupon = await buscarCuponAplicable(db, {
    codigo: datos.codigo,
    organizadorId: evento.organizadorId,
    eventoId: evento.id,
    subtotal: tanda.precio,
  });
  const descuento = calcularDescuento(cupon, tanda.precio);
  return { descuento, total: tanda.precio - descuento };
}

export interface CuponConsumido {
  cuponId: number;
  descuento: number;
}

/**
 * Re-valida y CONSUME el cupón dentro de la transacción de la compra.
 * Consumo atómico sin FOR UPDATE: el UPDATE condicional es la fuente de
 * verdad (activo, no vencido, cupo disponible) — si devuelve 0 filas, el
 * cupón se agotó/venció entre la previsualización y este momento, y la
 * compra falla en vez de cobrar el precio lleno en silencio (el comprador
 * ya transfirió el monto CON descuento).
 */
export async function consumirCupon(
  tx: Ejecutor,
  datos: { codigo: string; organizadorId: number; eventoId: number; subtotal: number; email: string },
): Promise<CuponConsumido> {
  const cupon = await buscarCuponAplicable(tx, datos);

  if (cupon.maxUsosPorComprador !== null) {
    const [{ n }] = await tx
      .select({ n: sql<number>`count(*)` })
      .from(cuponUsos)
      .where(and(eq(cuponUsos.cuponId, cupon.id), sql`lower(${cuponUsos.email}) = lower(${datos.email})`));
    if (Number(n) >= cupon.maxUsosPorComprador) {
      throw new ErrorNegocio("Ya usaste ese cupón el máximo de veces permitido.");
    }
  }

  const [consumido] = await tx
    .update(cupones)
    .set({ usos: sql`${cupones.usos} + 1` })
    .where(
      sql`${cupones.id} = ${cupon.id} AND ${cupones.activo}
          AND (${cupones.venceEn} IS NULL OR ${cupones.venceEn} > now())
          AND (${cupones.maxUsos} IS NULL OR ${cupones.usos} < ${cupones.maxUsos})`,
    )
    .returning({ id: cupones.id });
  if (!consumido) {
    throw new ErrorNegocio("Ese cupón se agotó o venció justo ahora. Revisá el total antes de transferir.");
  }

  return { cuponId: cupon.id, descuento: calcularDescuento(cupon, datos.subtotal) };
}

/** Reparto entero (largest remainder degenerado: todas las unidades de una
 * misma tanda valen lo mismo) de `monto` entre `n` unidades — la suma da
 * SIEMPRE exacto, nunca se pierden guaraníes por redondeo. Exportada:
 * server/carrito.ts (Fase 6) la reutiliza para repartir el descuento de
 * cada tanda entre sus propios tickets. */
export function repartirEntero(monto: number, n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(monto / n);
  const resto = monto - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < resto ? 1 : 0));
}

export interface ItemCarritoParaCupon {
  tandaId: number;
  eventoId: number;
  subtotal: number;
}

function itemsEnAlcance(
  cupon: { eventoId: number | null },
  items: ItemCarritoParaCupon[],
): ItemCarritoParaCupon[] {
  return cupon.eventoId === null ? items : items.filter((it) => it.eventoId === cupon.eventoId);
}

/** Igual que buscarCuponAplicable, pero para el carrito (Fase 6): un carrito
 * es de UN organizador pero puede tener tandas de VARIOS de sus eventos —
 * el cupón solo descuenta los ítems dentro de su alcance (su evento, o
 * "todos mis eventos" si eventoId es null). El monto mínimo se exige sobre
 * ese subtotal aplicable, no sobre el total del carrito. */
async function buscarCuponAplicableCarrito(
  ejecutor: Ejecutor,
  datos: { codigo: string; organizadorId: number; items: ItemCarritoParaCupon[] },
): Promise<{ cupon: typeof cupones.$inferSelect; itemsAplicables: ItemCarritoParaCupon[]; subtotalAplicable: number }> {
  const [cupon] = await ejecutor
    .select()
    .from(cupones)
    .where(sql`lower(${cupones.codigo}) = lower(${datos.codigo})`)
    .limit(1);
  if (!cupon) throw new ErrorNegocio("Ese cupón no existe.");
  if (!cupon.activo) throw new ErrorNegocio("Ese cupón ya no está activo.");
  if (cupon.venceEn && cupon.venceEn.getTime() <= Date.now()) {
    throw new ErrorNegocio("Ese cupón venció.");
  }
  if (cupon.organizadorId !== datos.organizadorId) {
    throw new ErrorNegocio("Ese cupón no es válido para tu carrito.");
  }

  const itemsAplicables = itemsEnAlcance(cupon, datos.items);
  const subtotalAplicable = itemsAplicables.reduce((s, it) => s + it.subtotal, 0);
  if (subtotalAplicable <= 0) {
    throw new ErrorNegocio("Ese cupón no aplica a ninguna de las entradas de tu carrito.");
  }
  if (subtotalAplicable < cupon.montoMinimo) {
    throw new ErrorNegocio(`Ese cupón requiere una compra de al menos ${formatoGs(cupon.montoMinimo)} en las entradas donde aplica.`);
  }
  return { cupon, itemsAplicables, subtotalAplicable };
}

export interface PreviaCuponCarrito {
  subtotal: number;
  descuentoTotal: number;
  total: number;
}

/** Solo lectura (no consume el cupón) — misma idea que previsualizarCupon,
 * pero sobre TODO el carrito. */
export async function previsualizarCuponCarrito(datos: {
  codigo: string;
  organizadorId: number;
  items: ItemCarritoParaCupon[];
}): Promise<PreviaCuponCarrito> {
  const subtotal = datos.items.reduce((s, it) => s + it.subtotal, 0);
  const { cupon, subtotalAplicable } = await buscarCuponAplicableCarrito(db, datos);
  const descuentoTotal = calcularDescuento(cupon, subtotalAplicable);
  return { subtotal, descuentoTotal, total: subtotal - descuentoTotal };
}

export interface ResultadoCuponCarrito {
  cuponId: number;
  descuentoTotal: number;
  /** Descuento ya repartido entero por tanda (sobre la unidad real, ver
   * repartirEntero) — cada tanda todavía tiene que repartir lo suyo entre
   * sus propios tickets, con la misma función. */
  descuentoPorTanda: Map<number, number>;
}

/**
 * Re-valida y CONSUME el cupón dentro de la transacción de checkout del
 * carrito (Fase 6) — mismo consumo atómico que consumirCupon() (UPDATE
 * condicional, sin FOR UPDATE), generalizado a varios ítems. El reparto
 * entero se hace sobre la lista PLANA de unidades aplicables (una entrada
 * por unidad real, no por ítem): así la suma por tanda, y por lo tanto el
 * total, da exacto sin importar cuántas tandas distintas toque el cupón.
 */
export async function consumirCuponCarrito(
  tx: Ejecutor,
  datos: {
    codigo: string;
    organizadorId: number;
    email: string;
    items: (ItemCarritoParaCupon & { cantidad: number })[];
  },
): Promise<ResultadoCuponCarrito> {
  const { cupon, itemsAplicables, subtotalAplicable } = await buscarCuponAplicableCarrito(tx, datos);

  if (cupon.maxUsosPorComprador !== null) {
    const [{ n }] = await tx
      .select({ n: sql<number>`count(*)` })
      .from(cuponUsos)
      .where(and(eq(cuponUsos.cuponId, cupon.id), sql`lower(${cuponUsos.email}) = lower(${datos.email})`));
    if (Number(n) >= cupon.maxUsosPorComprador) {
      throw new ErrorNegocio("Ya usaste ese cupón el máximo de veces permitido.");
    }
  }

  const [consumido] = await tx
    .update(cupones)
    .set({ usos: sql`${cupones.usos} + 1` })
    .where(
      sql`${cupones.id} = ${cupon.id} AND ${cupones.activo}
          AND (${cupones.venceEn} IS NULL OR ${cupones.venceEn} > now())
          AND (${cupones.maxUsos} IS NULL OR ${cupones.usos} < ${cupones.maxUsos})`,
    )
    .returning({ id: cupones.id });
  if (!consumido) {
    throw new ErrorNegocio("Ese cupón se agotó o venció justo ahora. Revisá el total antes de transferir.");
  }

  const descuentoTotal = calcularDescuento(cupon, subtotalAplicable);

  const unidades: number[] = [];
  for (const item of itemsAplicables) {
    const cantidad = datos.items.find((it) => it.tandaId === item.tandaId)!.cantidad;
    for (let i = 0; i < cantidad; i++) unidades.push(item.tandaId);
  }
  const descuentosPorUnidad = repartirEntero(descuentoTotal, unidades.length);
  const descuentoPorTanda = new Map<number, number>();
  unidades.forEach((tandaId, i) => {
    descuentoPorTanda.set(tandaId, (descuentoPorTanda.get(tandaId) ?? 0) + descuentosPorUnidad[i]);
  });

  return { cuponId: cupon.id, descuentoTotal, descuentoPorTanda };
}

export interface DatosCrearCupon {
  eventoId: number | undefined; // undefined = todos los eventos del organizador
  codigo: string;
  tipo: TipoCupon;
  valor: number;
  maxUsos?: number;
  maxUsosPorComprador?: number;
  montoMinimo?: number;
  venceEn?: string; // fecha ISO (yyyy-mm-dd) desde un <input type="date">
}

/** El organizador (o el evento, si se especifica uno) ya se validó como
 * propio/superadmin antes de llamar acá. */
export async function crearCupon(usuario: UsuarioSesion, datos: DatosCrearCupon): Promise<number> {
  // Riesgo real (ver plan de mejoras §5.10): un cupón de 100% sin tope de
  // usos es una fábrica de entradas gratis si el código se filtra.
  if (datos.tipo === "porcentaje" && datos.valor === 100 && !datos.maxUsos) {
    throw new ErrorNegocio("Un cupón del 100% tiene que tener un tope de usos (max_usos).");
  }

  const [creado] = await db
    .insert(cupones)
    .values({
      organizadorId: usuario.id,
      eventoId: datos.eventoId ?? null,
      codigo: datos.codigo,
      tipo: datos.tipo,
      valor: datos.valor,
      maxUsos: datos.maxUsos ?? null,
      maxUsosPorComprador: datos.maxUsosPorComprador ?? 1,
      montoMinimo: datos.montoMinimo ?? 0,
      venceEn: datos.venceEn ? new Date(datos.venceEn) : null,
    })
    .returning({ id: cupones.id });
  return creado.id;
}

/** Cupones que aplican a este evento: los suyos propios + los "todos mis
 * eventos" del mismo organizador. */
export async function listarCuponesDelEvento(eventoId: number, organizadorId: number) {
  return db
    .select()
    .from(cupones)
    .where(
      and(
        eq(cupones.organizadorId, organizadorId),
        sql`(${cupones.eventoId} = ${eventoId} OR ${cupones.eventoId} IS NULL)`,
      ),
    )
    .orderBy(cupones.creadoEn);
}

export async function obtenerCuponPropio(id: number, usuario: UsuarioSesion) {
  const [cupon] = await db.select().from(cupones).where(eq(cupones.id, id)).limit(1);
  if (!cupon) throw new ErrorNegocio("Cupón no encontrado.");
  if (usuario.rol !== "superadmin" && cupon.organizadorId !== usuario.id) {
    throw new ErrorNegocio("Ese cupón no te pertenece.");
  }
  return cupon;
}

export async function cambiarEstadoCupon(cupon: typeof cupones.$inferSelect, activo: boolean) {
  await db.update(cupones).set({ activo }).where(eq(cupones.id, cupon.id));
}
