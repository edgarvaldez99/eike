import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/cliente";
import { asientos, carritoItems, carritos, cuponUsos, eventos, ordenes, tandas, tickets } from "@/db/esquema";
import { ErrorNegocio } from "@/lib/errores";
import { MINUTOS_CARRITO_MAXIMO, MINUTOS_CARRITO_SLIDING } from "@/lib/constantes";
import { generarCodigoOrden, generarCodigoTicket } from "@/lib/qr";
import { consumirCuponCarrito, repartirEntero } from "@/server/cupones";
import {
  esVentaReferidaValida,
  otorgarPremiosPendientes,
  registrarVentaReferida,
  resolverReferidor,
} from "@/server/referidos";
import { escribirComprobante, type ComprobantePreparado } from "@/lib/archivos/comprobante";
import { HORAS_RESERVA } from "@/server/tickets";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// ============================================================================
// Identidad del carrito — creación y resolución del token
// ============================================================================

function generarTokenCarrito(): string {
  return randomBytes(24).toString("hex"); // 48 hex — mismo orden de entropía que un código de ticket
}

/** Crea un carrito vacío (organizadorId y expiraEn null hasta el primer
 * ítem). Reintenta ante una colisión de token (rarísima) — mismo patrón que
 * generarCodigoTicket/obtenerOCrearCodigoReferido. */
export async function crearCarrito(): Promise<typeof carritos.$inferSelect> {
  for (let intento = 0; intento < 5; intento++) {
    try {
      const [fila] = await db
        .insert(carritos)
        .values({ token: generarTokenCarrito(), estado: "activo" })
        .returning();
      return fila;
    } catch (error) {
      const codigoPg = (error as { code?: string } | null)?.code;
      if (codigoPg !== "23505") throw error;
    }
  }
  throw new ErrorNegocio("No se pudo crear el carrito, probá de nuevo.");
}

/** Un carrito es "utilizable" si existe, sigue 'activo' y no venció — un
 * carrito recién creado (expiraEn null, sin ítems todavía) siempre cuenta. */
function esUtilizable(carrito: typeof carritos.$inferSelect): boolean {
  return carrito.estado === "activo" && (carrito.expiraEn === null || carrito.expiraEn.getTime() > Date.now());
}

/** Busca el carrito de esta cookie — null si no hay token, no existe, o ya
 * no es utilizable (vencido/completado). El caller (Server Action, que es
 * quien puede escribir cookies) decide si hace falta crearCarrito() y
 * pisar la cookie con el token nuevo. */
export async function obtenerCarritoUtilizablePorToken(
  token: string | null,
): Promise<typeof carritos.$inferSelect | null> {
  if (!token) return null;
  const [carrito] = await db.select().from(carritos).where(eq(carritos.token, token)).limit(1);
  if (!carrito || !esUtilizable(carrito)) return null;
  return carrito;
}

/** Se llama al agregar un ítem estando logueado — marca este carrito como
 * "de esta cuenta" (solo si todavía no tenía dueño) para que
 * buscarCarritoParaAdoptar lo pueda encontrar después desde otro
 * dispositivo. Nunca reasigna un carrito que ya es de otra cuenta. */
export async function vincularCarritoAUsuario(carritoId: number, usuarioId: number): Promise<void> {
  await db
    .update(carritos)
    .set({ usuarioId })
    .where(and(eq(carritos.id, carritoId), sql`${carritos.usuarioId} is null`));
}

/**
 * Fusión de carrito entre dispositivos: al iniciar sesión, si el carrito de
 * ESTE dispositivo está vacío (nunca se le agregó nada, o ya se vació), se
 * busca el último carrito 'activo' y vigente de la cuenta —de OTRO
 * dispositivo, donde ya se vinculó vía vincularCarritoAUsuario— y se
 * devuelve para que el caller (Server Action) lo adopte pisando la cookie.
 * Si el carrito de este dispositivo ya tiene ítems propios, se devuelve
 * null: no hay que tirar lo que la persona ya venía armando acá.
 */
export async function buscarCarritoParaAdoptar(
  usuarioId: number,
  carritoActual: typeof carritos.$inferSelect | null,
): Promise<typeof carritos.$inferSelect | null> {
  if (carritoActual && carritoActual.organizadorId !== null) return null;

  const [candidato] = await db
    .select()
    .from(carritos)
    .where(
      and(
        eq(carritos.usuarioId, usuarioId),
        eq(carritos.estado, "activo"),
        sql`${carritos.expiraEn} is not null and ${carritos.expiraEn} > now()`,
        carritoActual ? sql`${carritos.id} <> ${carritoActual.id}` : sql`true`,
      ),
    )
    .orderBy(desc(carritos.creadoEn))
    .limit(1);
  return candidato ?? null;
}

// ============================================================================
// Reserva — recalculada entera, nunca +=/-=
// ============================================================================

/** Techo duro: sliding 15 min desde AHORA, sin pasar de 60 min desde que se
 * creó el carrito ni de la fecha del evento más próximo entre sus ítems
 * (no tiene sentido reservar más allá de eso). `fechaEventoMin` es null
 * solo si el carrito está vacío. */
function calcularExpiracionCarrito(creadoEn: Date, fechaEventoMin: Date | null): Date {
  const candidatos = [
    Date.now() + MINUTOS_CARRITO_SLIDING * 60_000,
    creadoEn.getTime() + MINUTOS_CARRITO_MAXIMO * 60_000,
  ];
  if (fechaEventoMin) candidatos.push(fechaEventoMin.getTime());
  return new Date(Math.min(...candidatos));
}

/**
 * Recalcula tandas.cantidad_reservada ENTERA desde carrito_items — nunca
 * `+= / -=`. Es lo que hace estructuralmente imposible el drift (ver
 * comentario en esquema.ts) y lo que hace que un carrito vencido deje de
 * contar en el instante en que vence, sin esperar al barrido: la condición
 * `c.expira_en > now()` ya lo excluye de la suma. Suma TODAS las filas de
 * la tanda por igual (pineadas o agregadas) — un asiento elegido cuenta
 * como una unidad más. Requiere que la fila de `tandas` ya esté bloqueada
 * (FOR UPDATE) por el caller, en el orden correcto (ver checkoutCarrito).
 */
export async function recalcularReservada(tx: Tx, tandaId: number): Promise<void> {
  await tx.execute(sql`
    UPDATE tandas t
       SET cantidad_reservada = COALESCE((
             SELECT SUM(ci.cantidad)
               FROM carrito_items ci
               JOIN carritos c ON c.id = ci.carrito_id
              WHERE ci.tanda_id = t.id
                AND c.estado = 'activo'
                AND c.expira_en > now()
           ), 0)
     WHERE t.id = ${tandaId}
  `);
}

/** MIN(fecha_evento) entre todos los ítems ACTUALES del carrito — null si
 * está vacío. Se recalcula tras cada mutación (no basta con mirar el ítem
 * recién tocado: un carrito puede tener tandas de varios eventos del mismo
 * organizador). */
async function fechaEventoMinDelCarrito(tx: Tx, carritoId: number): Promise<Date | null> {
  const [fila] = await tx
    .select({ min: sql<string | null>`min(${eventos.fechaEvento})` })
    .from(carritoItems)
    .innerJoin(tandas, eq(tandas.id, carritoItems.tandaId))
    .innerJoin(eventos, eq(eventos.id, tandas.eventoId))
    .where(eq(carritoItems.carritoId, carritoId));
  return fila?.min ? new Date(fila.min) : null;
}

/** Recalcula y guarda expira_en del carrito a partir de sus ítems actuales.
 * Si quedó vacío, no hay nada que reservar — se limpia expira_en y el
 * organizador fijado (blanco para que un ítem de otro organizador pueda
 * entrar). Requiere que el carrito ya esté bloqueado (FOR UPDATE). */
async function actualizarExpiracionCarrito(tx: Tx, carrito: typeof carritos.$inferSelect): Promise<void> {
  const fechaEventoMin = await fechaEventoMinDelCarrito(tx, carrito.id);
  if (fechaEventoMin === null) {
    await tx.update(carritos).set({ expiraEn: null, organizadorId: null }).where(eq(carritos.id, carrito.id));
    return;
  }
  const expiraEn = calcularExpiracionCarrito(carrito.creadoEn, fechaEventoMin);
  await tx.update(carritos).set({ expiraEn }).where(eq(carritos.id, carrito.id));
}

// ============================================================================
// Mutaciones del carrito
// ============================================================================

async function bloquearCarritoUtilizable(tx: Tx, carritoId: number): Promise<typeof carritos.$inferSelect> {
  const [carrito] = await tx.select().from(carritos).where(eq(carritos.id, carritoId)).for("update");
  if (!carrito) throw new ErrorNegocio("Ese carrito no existe.");
  if (!esUtilizable(carrito)) {
    throw new ErrorNegocio("Tu carrito venció. Volvé a agregar las entradas que querías comprar.");
  }
  return carrito;
}

/**
 * Agrega al carrito. Dos formas (ver esquema.ts):
 *  - `asientoId` presente: pinea ESE asiento (tanda numerada, cantidad
 *    siempre 1) — el asiento pasa a 'reservado' ahí mismo; el índice único
 *    parcial (uq_carrito_items_asiento) es lo que hace estructuralmente
 *    imposible que termine en dos carritos a la vez.
 *  - `asientoId` ausente: suma `cantidad` a la fila agregada de esa tanda
 *    (tanda general, o numerada sin asiento elegido — se auto-asigna recién
 *    en el checkout, mismo criterio que ya usa un invitado).
 *
 * Orden de locks: carrito primero, la tanda después (una sola acá, no hay
 * lista todavía) — mismo orden que sigue el checkout con varias.
 */
export async function agregarItemCarrito(
  carritoId: number,
  datos: { tandaId: number; cantidad: number; asientoId?: number | null },
): Promise<void> {
  const asientoId = datos.asientoId ?? null;
  if (asientoId !== null && datos.cantidad !== 1) {
    throw new ErrorNegocio("Un asiento elegido es siempre una sola unidad.");
  }

  await db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL lock_timeout = '3s'`);

    const carrito = await bloquearCarritoUtilizable(tx, carritoId);

    const [tanda] = await tx.select().from(tandas).where(eq(tandas.id, datos.tandaId)).for("update");
    if (!tanda) throw new ErrorNegocio("Esa tanda no existe.");
    if (tanda.estado !== "activa") throw new ErrorNegocio("Esa tanda ya no está disponible.");
    if (asientoId !== null && tanda.tipo !== "numerada") {
      throw new ErrorNegocio("Solo se puede elegir un asiento en una tanda numerada.");
    }

    const [evento] = await tx.select().from(eventos).where(eq(eventos.id, tanda.eventoId)).limit(1);
    if (!evento || evento.estado !== "publicado") {
      throw new ErrorNegocio("Ese evento no está disponible para la venta.");
    }

    if (carrito.organizadorId !== null && carrito.organizadorId !== evento.organizadorId) {
      throw new ErrorNegocio(
        "Tu carrito ya tiene entradas de otro organizador. Completá o vaciá esa compra antes de agregar esta.",
      );
    }

    if (asientoId !== null) {
      const [asiento] = await tx
        .select()
        .from(asientos)
        .where(and(eq(asientos.id, asientoId), eq(asientos.tandaId, tanda.id)))
        .for("update");
      if (!asiento) throw new ErrorNegocio("Ese asiento no existe.");
      if (asiento.estado !== "disponible") throw new ErrorNegocio("Ese asiento ya no está disponible.");

      try {
        await tx.insert(carritoItems).values({ carritoId, tandaId: tanda.id, asientoId, cantidad: 1 });
      } catch (error) {
        const codigoPg = (error as { code?: string } | null)?.code;
        // uq_carrito_items_asiento — perdió la carrera contra otro carrito
        // por el MISMO asiento (rarísimo: recién se validó 'disponible'
        // arriba, pero la fila de asientos no tenía FOR UPDATE hasta acá).
        if (codigoPg === "23505") throw new ErrorNegocio("Ese asiento ya está en otro carrito.");
        throw error;
      }
      await tx.update(asientos).set({ estado: "reservado" }).where(eq(asientos.id, asientoId));
    } else {
      const [existente] = await tx
        .select()
        .from(carritoItems)
        .where(
          and(
            eq(carritoItems.carritoId, carritoId),
            eq(carritoItems.tandaId, tanda.id),
            sql`${carritoItems.asientoId} is null`,
          ),
        )
        .limit(1);
      const cantidadPrevia = existente?.cantidad ?? 0;
      const cantidadNueva = cantidadPrevia + datos.cantidad;
      if (cantidadNueva > 20) {
        throw new ErrorNegocio("Como mucho 20 entradas de una misma tanda por compra.");
      }

      // cantidad_vendida + cantidad_reservada ya cuenta lo que ESTE carrito
      // tenía reservado de esta tanda — se resta para no contarlo dos veces
      // contra el cupo real. Los asientos pineados de ESTA MISMA tanda
      // también están adentro de cantidad_reservada, y eso es correcto: son
      // unidades igual de reales, restan cupo igual.
      const disponibleReal = tanda.cantidadTotal - tanda.cantidadVendida - tanda.cantidadReservada + cantidadPrevia;
      if (cantidadNueva > disponibleReal) {
        throw new ErrorNegocio(
          disponibleReal <= 0
            ? "Esa tanda está agotada."
            : `Solo quedan ${disponibleReal} disponibles de "${tanda.nombre}".`,
        );
      }

      if (existente) {
        await tx.update(carritoItems).set({ cantidad: cantidadNueva }).where(eq(carritoItems.id, existente.id));
      } else {
        await tx.insert(carritoItems).values({ carritoId, tandaId: tanda.id, cantidad: cantidadNueva });
      }
    }

    await tx.update(carritos).set({ organizadorId: evento.organizadorId }).where(eq(carritos.id, carritoId));
    await actualizarExpiracionCarrito(tx, { ...carrito, organizadorId: evento.organizadorId });
    await recalcularReservada(tx, tanda.id);
  });
}

/** Cantidad ABSOLUTA (no delta) — si llega a 0 o menos, elimina el ítem
 * (delegando en quitarItemCarrito, que también libera un asiento pineado si
 * corresponde). Rechaza cambiar la cantidad de una fila con asiento
 * pineado: esa fila es SIEMPRE una unidad — para sacarla está "Quitar". */
export async function actualizarCantidadItemCarrito(
  carritoId: number,
  itemId: number,
  cantidad: number,
): Promise<void> {
  if (cantidad <= 0) {
    await quitarItemCarrito(carritoId, itemId);
    return;
  }

  await db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL lock_timeout = '3s'`);
    const carrito = await bloquearCarritoUtilizable(tx, carritoId);

    const [item] = await tx
      .select()
      .from(carritoItems)
      .where(and(eq(carritoItems.id, itemId), eq(carritoItems.carritoId, carritoId)))
      .limit(1);
    if (!item) throw new ErrorNegocio("Ese ítem no está en tu carrito.");
    if (item.asientoId !== null) {
      throw new ErrorNegocio("Ese asiento es una unidad fija — usá \"Quitar\" para sacarlo del carrito.");
    }
    if (cantidad > 20) throw new ErrorNegocio("Como mucho 20 entradas de una misma tanda por compra.");

    const [tanda] = await tx.select().from(tandas).where(eq(tandas.id, item.tandaId)).for("update");
    if (!tanda) throw new ErrorNegocio("Esa tanda no existe.");
    const disponibleReal = tanda.cantidadTotal - tanda.cantidadVendida - tanda.cantidadReservada + item.cantidad;
    if (cantidad > disponibleReal) {
      throw new ErrorNegocio(`Solo quedan ${disponibleReal} disponibles de "${tanda.nombre}".`);
    }
    await tx.update(carritoItems).set({ cantidad }).where(eq(carritoItems.id, item.id));

    await actualizarExpiracionCarrito(tx, carrito);
    await recalcularReservada(tx, item.tandaId);
  });
}

/** Saca un ítem del carrito por su id (no por tandaId: una tanda numerada
 * puede tener varias filas, una por asiento pineado). Si tenía un asiento
 * pineado, lo libera ('disponible' de nuevo). */
export async function quitarItemCarrito(carritoId: number, itemId: number): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL lock_timeout = '3s'`);
    const carrito = await bloquearCarritoUtilizable(tx, carritoId);

    const [item] = await tx
      .select()
      .from(carritoItems)
      .where(and(eq(carritoItems.id, itemId), eq(carritoItems.carritoId, carritoId)))
      .limit(1);
    if (!item) throw new ErrorNegocio("Ese ítem no está en tu carrito.");

    await tx.delete(carritoItems).where(eq(carritoItems.id, item.id));
    if (item.asientoId !== null) {
      await tx
        .update(asientos)
        .set({ estado: "disponible" })
        .where(and(eq(asientos.id, item.asientoId), eq(asientos.estado, "reservado")));
    }

    await actualizarExpiracionCarrito(tx, carrito);
    await recalcularReservada(tx, item.tandaId);
  });
}

// ============================================================================
// Lectura — resumen para la página del carrito
// ============================================================================

export interface ItemCarrito {
  id: number;
  tandaId: number;
  tandaNombre: string;
  tipo: "general" | "numerada";
  precio: number;
  cantidad: number;
  asientoId: number | null;
  asientoIdentificador: string | null;
  eventoId: number;
  eventoNombre: string;
  subtotal: number;
}

export interface ResumenCarrito {
  items: ItemCarrito[];
  subtotal: number;
  organizadorId: number | null;
  /** Nunca confiar en el reloj del cliente — se manda ya calculado. */
  segundosRestantes: number | null;
  vencido: boolean;
}

/** Solo la cantidad de unidades — para el indicador del header (mucho más
 * liviano que traer el resumen entero en cada página pública). */
export async function contarUnidadesCarrito(carritoId: number): Promise<number> {
  const [fila] = await db
    .select({ n: sql<number>`coalesce(sum(${carritoItems.cantidad}), 0)` })
    .from(carritoItems)
    .where(eq(carritoItems.carritoId, carritoId));
  return Number(fila?.n ?? 0);
}

export async function obtenerResumenCarrito(carritoId: number): Promise<ResumenCarrito> {
  const [carrito] = await db.select().from(carritos).where(eq(carritos.id, carritoId)).limit(1);
  if (!carrito) throw new ErrorNegocio("Ese carrito no existe.");

  const filas = await db
    .select({
      id: carritoItems.id,
      tandaId: tandas.id,
      tandaNombre: tandas.nombre,
      tipo: tandas.tipo,
      precio: tandas.precio,
      cantidad: carritoItems.cantidad,
      asientoId: carritoItems.asientoId,
      asientoIdentificador: asientos.identificador,
      eventoId: eventos.id,
      eventoNombre: eventos.nombre,
    })
    .from(carritoItems)
    .innerJoin(tandas, eq(tandas.id, carritoItems.tandaId))
    .innerJoin(eventos, eq(eventos.id, tandas.eventoId))
    .leftJoin(asientos, eq(asientos.id, carritoItems.asientoId))
    .where(eq(carritoItems.carritoId, carritoId))
    .orderBy(asc(carritoItems.agregadoEn));

  const items: ItemCarrito[] = filas.map((f) => ({
    ...f,
    asientoIdentificador: f.asientoIdentificador ?? null,
    subtotal: f.precio * f.cantidad,
  }));
  const subtotal = items.reduce((s, it) => s + it.subtotal, 0);
  const vencido = carrito.estado !== "activo" || (carrito.expiraEn !== null && carrito.expiraEn.getTime() <= Date.now());
  const segundosRestantes =
    carrito.expiraEn && !vencido ? Math.max(0, Math.round((carrito.expiraEn.getTime() - Date.now()) / 1000)) : null;

  return { items, subtotal, organizadorId: carrito.organizadorId, segundosRestantes, vencido };
}

// ============================================================================
// Checkout — la transacción delicada
// ============================================================================

export interface DatosCheckoutCarrito {
  nombreComprador: string;
  cedula: string | null;
  email: string;
  contacto: string | null;
  comprobanteTexto: string | null;
  comprobante: ComprobantePreparado | null;
  codigoCupon: string | null;
  codigoReferido: string | null;
}

export interface ResultadoCheckoutCarrito {
  orden: typeof ordenes.$inferSelect;
  tickets: (typeof tickets.$inferSelect)[];
}

/**
 * Convierte un carrito en una orden + N tickets — puerto del comprarTicket
 * de la Fase 5/7/8, generalizado a varios ítems (Fase 6). Orden de locks,
 * no negociable (ver plan de mejoras): 1) carrito, 2) tandas ascendente por
 * id — un statement por id, nunca `WHERE id = ANY(...) ORDER BY ... FOR
 * UPDATE` (Postgres no garantiza que ese orden sea el de adquisición de
 * locks) —, 3) asientos ascendente (los que hay que auto-asignar; los ya
 * pineados no compiten con nadie más, ver más abajo), 4) cupón último (por
 * UPDATE condicional, sin FOR UPDATE).
 *
 * El carrito se marca 'completado' y se recalcula cantidad_reservada de
 * cada tanda tocada ANTES de insertar los tickets: recalcularReservada solo
 * suma carritos 'activo', así que este ya queda afuera de la cuenta —
 * evita un falso doble conteo (reservado + recién vendido) contra
 * chk_tandas_stock cuando trg_tickets_stock suba cantidad_vendida.
 */
export async function checkoutCarrito(
  carritoId: number,
  compradorId: number | null,
  datos: DatosCheckoutCarrito,
): Promise<ResultadoCheckoutCarrito> {
  const creado = await db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL lock_timeout = '3s'`);

    const carrito = await bloquearCarritoUtilizable(tx, carritoId);
    if (carrito.organizadorId === null) {
      throw new ErrorNegocio("Tu carrito está vacío.");
    }

    const items = await tx.select().from(carritoItems).where(eq(carritoItems.carritoId, carritoId));
    if (items.length === 0) throw new ErrorNegocio("Tu carrito está vacío.");

    // Una tanda puede tener VARIAS filas (una agregada + una por cada
    // asiento pineado) — se agrupan para lockear/recorrer una vez por tanda.
    const itemsPorTanda = new Map<number, typeof items>();
    for (const item of items) {
      const lista = itemsPorTanda.get(item.tandaId) ?? [];
      lista.push(item);
      itemsPorTanda.set(item.tandaId, lista);
    }
    const tandaIdsOrdenados = [...itemsPorTanda.keys()].sort((a, b) => a - b);

    // 2) tandas, ascendente por id, un SELECT ... FOR UPDATE por id.
    const tandasLockeadas = new Map<number, typeof tandas.$inferSelect>();
    for (const tandaId of tandaIdsOrdenados) {
      const [tanda] = await tx.select().from(tandas).where(eq(tandas.id, tandaId)).for("update");
      if (!tanda) throw new ErrorNegocio("Una de las tandas de tu carrito ya no existe.");
      if (tanda.estado !== "activa") throw new ErrorNegocio(`La tanda "${tanda.nombre}" ya no está disponible.`);
      tandasLockeadas.set(tandaId, tanda);
    }

    const eventosIds = [...new Set([...tandasLockeadas.values()].map((t) => t.eventoId))];
    const eventosMap = new Map<number, typeof eventos.$inferSelect>();
    for (const eventoId of eventosIds) {
      const [evento] = await tx.select().from(eventos).where(eq(eventos.id, eventoId)).limit(1);
      if (!evento || evento.estado !== "publicado") {
        throw new ErrorNegocio("Uno de los eventos de tu carrito ya no está disponible para la venta.");
      }
      eventosMap.set(eventoId, evento);
    }

    const totalUnidadesPorTanda = new Map<number, number>();
    let subtotalBruto = 0;
    for (const tandaId of tandaIdsOrdenados) {
      const totalUnidades = itemsPorTanda.get(tandaId)!.reduce((s, it) => s + it.cantidad, 0);
      totalUnidadesPorTanda.set(tandaId, totalUnidades);
      subtotalBruto += tandasLockeadas.get(tandaId)!.precio * totalUnidades;
    }

    // 4) cupón — último, por UPDATE condicional (ver server/cupones.ts).
    let cuponId: number | null = null;
    let descuentoTotal = 0;
    let descuentoPorTanda = new Map<number, number>();
    if (datos.codigoCupon) {
      const resultado = await consumirCuponCarrito(tx, {
        codigo: datos.codigoCupon,
        organizadorId: carrito.organizadorId,
        email: datos.email,
        items: tandaIdsOrdenados.map((tandaId) => ({
          tandaId,
          eventoId: tandasLockeadas.get(tandaId)!.eventoId,
          subtotal: tandasLockeadas.get(tandaId)!.precio * totalUnidadesPorTanda.get(tandaId)!,
          cantidad: totalUnidadesPorTanda.get(tandaId)!,
        })),
      });
      cuponId = resultado.cuponId;
      descuentoTotal = resultado.descuentoTotal;
      descuentoPorTanda = resultado.descuentoPorTanda;
    }

    const total = subtotalBruto - descuentoTotal;
    const esGratis = total <= 0;
    if (!esGratis && !datos.comprobante) {
      throw new ErrorNegocio("Hace falta subir el comprobante de pago.");
    }

    let referidorId: number | null = null;
    if (datos.codigoReferido) {
      const referidor = await resolverReferidor(datos.codigoReferido);
      if (
        referidor &&
        esVentaReferidaValida({
          referidor,
          organizadorId: carrito.organizadorId,
          compradorId,
          email: datos.email,
          cedula: datos.cedula,
        })
      ) {
        referidorId = referidor.id;
      }
    }

    const codigoOrden = generarCodigoOrden();
    const estadoOrden = esGratis ? "pagada" : "pendiente";
    const estadoTicket = esGratis ? "disponible" : "pendiente";
    const reservadoHasta = esGratis ? null : new Date(Date.now() + HORAS_RESERVA * 60 * 60 * 1000);
    const cantidadTotalTickets = items.reduce((s, it) => s + it.cantidad, 0);
    const comprobanteArchivo = !esGratis && datos.comprobante ? `${codigoOrden}.${datos.comprobante.extension}` : null;

    const [orden] = await tx
      .insert(ordenes)
      .values({
        codigo: codigoOrden,
        organizadorId: carrito.organizadorId,
        compradorId,
        nombreComprador: datos.nombreComprador,
        cedula: datos.cedula,
        email: datos.email,
        contacto: datos.contacto,
        comprobante: datos.comprobanteTexto,
        comprobanteArchivo,
        subtotal: subtotalBruto,
        descuento: descuentoTotal,
        cuponId,
        codigoCupon: cuponId !== null ? datos.codigoCupon : null,
        referidoPorUsuarioId: referidorId,
        codigoReferido: referidorId !== null ? datos.codigoReferido : null,
        cantidadTickets: cantidadTotalTickets,
        estado: estadoOrden,
        reservadoHasta,
      })
      .returning();

    // Marcar el carrito completado + recalcular la reserva de cada tanda
    // tocada ANTES de insertar tickets (ver comentario de la función).
    await tx.update(carritos).set({ estado: "completado" }).where(eq(carritos.id, carritoId));
    for (const tandaId of tandaIdsOrdenados) {
      await recalcularReservada(tx, tandaId);
    }

    const ticketsCreados: (typeof tickets.$inferSelect)[] = [];
    for (const tandaId of tandaIdsOrdenados) {
      const tanda = tandasLockeadas.get(tandaId)!;
      const filasDeEstaTanda = itemsPorTanda.get(tandaId)!;
      const descuentosPorUnidad = repartirEntero(
        descuentoPorTanda.get(tandaId) ?? 0,
        totalUnidadesPorTanda.get(tandaId)!,
      );
      let cursor = 0;

      for (const fila of filasDeEstaTanda) {
        if (fila.asientoId !== null) {
          // Ya reservado por ESTE carrito al agregarlo (estado 'reservado')
          // — es una unidad ya asignada, no compite con nadie ni necesita
          // SKIP LOCKED: nada más puede tenerla (uq_carrito_items_asiento).
          await tx
            .update(asientos)
            .set({ estado: esGratis ? "vendido" : "reservado" })
            .where(eq(asientos.id, fila.asientoId));
          const [creado] = await tx
            .insert(tickets)
            .values({
              codigo: generarCodigoTicket(),
              eventoId: tanda.eventoId,
              tandaId: tanda.id,
              asientoId: fila.asientoId,
              ordenId: orden.id,
              compradorId,
              nombreComprador: datos.nombreComprador,
              cedula: datos.cedula,
              email: datos.email,
              contacto: datos.contacto,
              estado: estadoTicket,
              precioUnitario: tanda.precio,
              descuento: descuentosPorUnidad[cursor],
              reservadoHasta,
            })
            .returning();
          ticketsCreados.push(creado);
          cursor++;
          continue;
        }

        for (let i = 0; i < fila.cantidad; i++) {
          let asientoId: number | null = null;
          if (tanda.tipo === "numerada") {
            // 3) asientos ascendente por id, SKIP LOCKED — mismo criterio
            // que ya usa comprarTicket para un invitado (auto-asignado).
            const [asiento] = await tx
              .select()
              .from(asientos)
              .where(and(eq(asientos.tandaId, tanda.id), eq(asientos.estado, "disponible")))
              .orderBy(asc(asientos.id))
              .limit(1)
              .for("update", { skipLocked: true });
            if (!asiento) throw new ErrorNegocio(`Ya no quedan asientos disponibles en "${tanda.nombre}".`);
            asientoId = asiento.id;
            await tx
              .update(asientos)
              .set({ estado: esGratis ? "vendido" : "reservado" })
              .where(eq(asientos.id, asientoId));
          }

          const [creado] = await tx
            .insert(tickets)
            .values({
              codigo: generarCodigoTicket(),
              eventoId: tanda.eventoId,
              tandaId: tanda.id,
              asientoId,
              ordenId: orden.id,
              compradorId,
              nombreComprador: datos.nombreComprador,
              cedula: datos.cedula,
              email: datos.email,
              contacto: datos.contacto,
              estado: estadoTicket,
              precioUnitario: tanda.precio,
              descuento: descuentosPorUnidad[cursor],
              reservadoHasta,
            })
            .returning();
          ticketsCreados.push(creado);
          cursor++;
        }
      }
    }

    if (cuponId !== null) {
      await tx.insert(cuponUsos).values({
        cuponId,
        ordenId: orden.id,
        compradorId,
        email: datos.email,
        montoDescontado: descuentoTotal,
      });
    }

    if (referidorId !== null) {
      // Una venta referida es "una por orden" (uq_referidos_ventas_orden) —
      // se le atribuye al primer evento tocado; con un solo organizador por
      // carrito, el otorgamiento de premios igual recorre TODOS los eventos
      // tocados, no solo ese.
      await registrarVentaReferida(tx, {
        referidorId,
        ordenId: orden.id,
        organizadorId: carrito.organizadorId,
        eventoId: eventosIds[0],
        cantidadTickets: cantidadTotalTickets,
        monto: total,
        estadoInicial: estadoOrden === "pagada" ? "valida" : "pendiente",
      });
      if (estadoOrden === "pagada") {
        for (const eventoId of eventosIds) {
          await otorgarPremiosPendientes(tx, referidorId, carrito.organizadorId, eventoId);
        }
      }
    }

    return { orden, tickets: ticketsCreados };
  });

  if (datos.comprobante && creado.orden.comprobanteArchivo) {
    await escribirComprobante(datos.comprobante, creado.orden.codigo);
  }

  return creado;
}

// ============================================================================
// Barrido de carritos vencidos
// ============================================================================

/**
 * A diferencia de barrerReservasVencidas (tickets.ts), acá el barrido NO es
 * lo que libera el CUPO — eso ya es automático (recalcularReservada excluye
 * a cualquier carrito vencido de la suma en el instante en que vence, sin
 * esperar a este cron). Pero sí es lo único que libera un ASIENTO PINEADO
 * (ver esquema.ts): mientras la fila de carrito_items siga viva, el índice
 * único (uq_carrito_items_asiento) sigue reservándolo para este carrito
 * aunque haya vencido — hay que borrar esa fila Y devolver el asiento a
 * 'disponible' para que otro pueda tomarlo. El resto es higiene: marcar
 * 'vencido' el carrito, para que no se acumulen filas muertas.
 */
export async function barrerCarritosVencidos(limite = 200): Promise<number> {
  const candidatos = await db
    .select({ id: carritos.id })
    .from(carritos)
    .where(sql`${carritos.estado} = 'activo' AND ${carritos.expiraEn} is not null AND ${carritos.expiraEn} <= now()`)
    .orderBy(asc(carritos.id))
    .limit(limite);

  let barridos = 0;
  for (const { id } of candidatos) {
    const seBarrioEste = await db.transaction(async (tx) => {
      const [carrito] = await tx
        .select()
        .from(carritos)
        .where(
          sql`${carritos.id} = ${id} AND ${carritos.estado} = 'activo' AND ${carritos.expiraEn} <= now()`,
        )
        .for("update", { skipLocked: true });
      if (!carrito) return false; // alguien lo está usando (checkout en curso) o ya cambió de estado

      const itemsDelCarrito = await tx.select().from(carritoItems).where(eq(carritoItems.carritoId, carrito.id));
      const asientosPineados = itemsDelCarrito.map((it) => it.asientoId).filter((id): id is number => id !== null);
      if (asientosPineados.length > 0) {
        await tx
          .update(asientos)
          .set({ estado: "disponible" })
          .where(and(inArray(asientos.id, asientosPineados), eq(asientos.estado, "reservado")));
      }

      await tx.delete(carritoItems).where(eq(carritoItems.carritoId, carrito.id));
      await tx.update(carritos).set({ estado: "vencido" }).where(eq(carritos.id, carrito.id));
      for (const tandaId of new Set(itemsDelCarrito.map((it) => it.tandaId))) {
        await recalcularReservada(tx, tandaId);
      }
      return true;
    });
    if (seBarrioEste) barridos++;
  }
  return barridos;
}
