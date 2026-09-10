import { randomBytes } from "node:crypto";
import { and, desc, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db/cliente";
import { premiosReferidos, programasReferidos, referidosVentas, tandas, usuarios } from "@/db/esquema";
import { ErrorNegocio } from "@/lib/errores";
// De @/server/cortesias, NO de @/server/tickets: tickets.ts importa de este
// mismo archivo (sincronizarVentaReferidaYPremios) — importar emitirCortesia
// desde ahí armaría el import circular que cortesias.ts existe para evitar.
import { emitirCortesia } from "@/server/cortesias";
import type { UsuarioSesion } from "@/lib/auth/sesion";
import type { EstadoVentaReferida } from "@/lib/constantes";

// Mismo tipo que en cortesias.ts/tickets.ts, definido acá de nuevo (en vez
// de importado) para no depender de ninguno de los dos a nivel de tipos.
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Sin 0/O/1/I/L — se tipea a mano, y esos caracteres se confunden entre sí
// en pantalla. 8 caracteres de este alfabeto (33 símbolos) ≈ 40 bits.
const ALFABETO_CODIGO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const LARGO_CODIGO = 8;

function generarCodigoReferido(): string {
  const bytes = randomBytes(LARGO_CODIGO);
  let codigo = "";
  for (let i = 0; i < LARGO_CODIGO; i++) codigo += ALFABETO_CODIGO[bytes[i] % ALFABETO_CODIGO.length];
  return codigo;
}

/** Perezoso: se genera la primera vez que hace falta (entrar a /panel/cuenta,
 * o compartir un evento estando logueado). Reintenta ante una colisión
 * (23505) — mismo patrón que generarCodigoTicket/generarCodigoOrden. */
export async function obtenerOCrearCodigoReferido(usuarioId: number): Promise<string> {
  const [fila] = await db
    .select({ codigoReferido: usuarios.codigoReferido })
    .from(usuarios)
    .where(eq(usuarios.id, usuarioId))
    .limit(1);
  if (fila?.codigoReferido) return fila.codigoReferido;

  for (let intento = 0; intento < 5; intento++) {
    const codigo = generarCodigoReferido();
    try {
      await db.update(usuarios).set({ codigoReferido: codigo }).where(eq(usuarios.id, usuarioId));
      return codigo;
    } catch (error) {
      const codigoPg = (error as { code?: string } | null)?.code;
      if (codigoPg !== "23505") throw error;
      // colisión (rarísima): probar con otro código en la próxima vuelta
    }
  }
  throw new ErrorNegocio("No se pudo generar un código de referido, probá de nuevo.");
}

export interface Referidor {
  id: number;
  nombre: string;
  email: string;
  cedula: string | null;
}

/** Resuelve un código de referido a la persona detrás — null si no existe. Se
 * llama tanto al comprar (para snapshotear a quién se le atribuye la venta)
 * como al calcular premios. No valida nada de negocio acá (eso es
 * esVentaReferidaValida): esto es solo la búsqueda. */
export async function resolverReferidor(codigo: string): Promise<Referidor | null> {
  const [fila] = await db
    .select({ id: usuarios.id, nombre: usuarios.nombre, email: usuarios.email, cedula: usuarios.cedula })
    .from(usuarios)
    .where(sql`lower(${usuarios.codigoReferido}) = lower(${codigo})`)
    .limit(1);
  return fila ?? null;
}

/**
 * Anti-fraude (plan de mejoras §3.5), como predicado único y testeable caso
 * por caso: sin esto, cualquiera se referiría a sí mismo, o el organizador
 * se premiaría con sus propias ventas.
 */
export function esVentaReferidaValida(datos: {
  referidor: Referidor;
  organizadorId: number;
  compradorId: number | null;
  email: string;
  cedula: string | null;
}): boolean {
  if (datos.referidor.id === datos.organizadorId) return false; // el organizador no se premia a sí mismo
  if (datos.compradorId !== null && datos.compradorId === datos.referidor.id) return false; // auto-referido, con cuenta
  if (datos.email.trim().toLowerCase() === datos.referidor.email.trim().toLowerCase()) return false; // auto-referido, invitado
  if (datos.cedula && datos.referidor.cedula && datos.cedula.trim() === datos.referidor.cedula.trim()) return false;
  return true;
}

/**
 * Registra la venta referida DENTRO de la transacción de la compra —
 * llamar solo si esVentaReferidaValida() dio true. `estadoInicial` refleja
 * el estado con el que nace la orden ('pendiente' si hay que aprobarla a
 * mano, 'valida' si nace ya resuelta — gratis o cupón del 100%).
 */
export async function registrarVentaReferida(
  tx: Tx,
  datos: {
    referidorId: number;
    ordenId: number;
    organizadorId: number;
    eventoId: number;
    cantidadTickets: number;
    monto: number;
    estadoInicial: Extract<EstadoVentaReferida, "pendiente" | "valida">;
  },
): Promise<void> {
  await tx.insert(referidosVentas).values({
    referidorId: datos.referidorId,
    ordenId: datos.ordenId,
    organizadorId: datos.organizadorId,
    eventoId: datos.eventoId,
    cantidadTickets: datos.cantidadTickets,
    monto: datos.monto,
    estado: datos.estadoInicial,
    confirmadaEn: datos.estadoInicial === "valida" ? new Date() : null,
  });
}

/** Se llama desde aprobarOrden/rechazarOrden/barrerReservasVencidas cuando
 * la orden cambia de estado — si esa orden tenía una venta referida, la
 * sincroniza. No hace nada si la orden no tenía referido (la mayoría). */
async function actualizarEstadoVentaReferida(
  tx: Tx,
  ordenId: number,
  nuevoEstado: EstadoVentaReferida,
): Promise<{ referidorId: number; organizadorId: number; eventoId: number } | null> {
  const [venta] = await tx
    .update(referidosVentas)
    .set({ estado: nuevoEstado, confirmadaEn: nuevoEstado === "valida" ? new Date() : sql`confirmada_en` })
    .where(eq(referidosVentas.ordenId, ordenId))
    .returning({ referidorId: referidosVentas.referidorId, organizadorId: referidosVentas.organizadorId, eventoId: referidosVentas.eventoId });
  return venta ?? null;
}

/**
 * Al validar una venta referida (justo después de actualizarEstadoVentaReferida
 * con 'valida'), intenta otorgar los premios que correspondan. Se llama
 * SIEMPRE, sea que la orden se aprobó a mano o nació ya resuelta — es
 * idempotente (uq_premios_referidos_umbral), así que llamarla de más nunca
 * duplica un premio.
 */
export async function sincronizarVentaReferidaYPremios(
  tx: Tx,
  ordenId: number,
  nuevoEstado: EstadoVentaReferida,
): Promise<void> {
  const venta = await actualizarEstadoVentaReferida(tx, ordenId, nuevoEstado);
  if (!venta || nuevoEstado !== "valida") return;
  await otorgarPremiosPendientes(tx, venta.referidorId, venta.organizadorId, venta.eventoId);
}

/**
 * Otorga los premios que el referidor se ganó y todavía no tiene, para
 * cada programa activo del organizador que aplique (todos sus eventos, o
 * el evento puntual de esta venta). Sin FOR UPDATE: la seguridad la da
 * uq_premios_referidos_umbral (dos llamadas concurrentes que calculen el
 * mismo umbral compiten por la misma fila; la segunda pierde y se descarta).
 *
 * Un fallo al emitir la cortesía (ej. la tanda-premio ya no tiene cupo) NO
 * puede abortar la transacción que la rodea (la aprobación de la orden
 * original) — por eso el SAVEPOINT: se descarta solo el intento de premio,
 * dejando el resto de la transacción intacta.
 */
export async function otorgarPremiosPendientes(
  tx: Tx,
  referidorId: number,
  organizadorId: number,
  eventoId: number,
): Promise<void> {
  const programas = await tx
    .select()
    .from(programasReferidos)
    .where(
      and(
        eq(programasReferidos.organizadorId, organizadorId),
        eq(programasReferidos.activo, true),
        sql`(${programasReferidos.eventoId} is null or ${programasReferidos.eventoId} = ${eventoId})`,
        sql`(${programasReferidos.iniciaEn} is null or ${programasReferidos.iniciaEn} <= now())`,
        sql`(${programasReferidos.terminaEn} is null or ${programasReferidos.terminaEn} >= now())`,
      ),
    );

  for (const programa of programas) {
    const [{ n }] = await tx
      .select({ n: sql<number>`count(*)` })
      .from(referidosVentas)
      .where(
        and(
          eq(referidosVentas.referidorId, referidorId),
          eq(referidosVentas.organizadorId, organizadorId),
          eq(referidosVentas.estado, "valida"),
          sql`${referidosVentas.monto} > ${programa.montoMinimoVenta}`,
        ),
      );
    const [{ n: otorgados }] = await tx
      .select({ n: sql<number>`count(*)` })
      .from(premiosReferidos)
      .where(and(eq(premiosReferidos.programaId, programa.id), eq(premiosReferidos.referidorId, referidorId), ne(premiosReferidos.estado, "anulado")));

    let debidos = Math.floor(Number(n) / programa.ventasRequeridas) - Number(otorgados);
    if (programa.maxPremiosPorUsuario !== null) {
      debidos = Math.min(debidos, programa.maxPremiosPorUsuario - Number(otorgados));
    }

    for (let k = 1; k <= debidos; k++) {
      const umbral = (Number(otorgados) + k) * programa.ventasRequeridas;
      await otorgarUnPremio(tx, programa, referidorId, umbral);
    }
  }
}

async function otorgarUnPremio(
  tx: Tx,
  programa: typeof programasReferidos.$inferSelect,
  referidorId: number,
  umbral: number,
): Promise<void> {
  let premioId: number;
  try {
    const [premio] = await tx
      .insert(premiosReferidos)
      .values({ programaId: programa.id, referidorId, ventasConsumidas: umbral, estado: "otorgado" })
      .returning({ id: premiosReferidos.id });
    premioId = premio.id;
  } catch (error) {
    const codigoPg = (error as { code?: string } | null)?.code;
    if (codigoPg === "23505") return; // otro proceso ya otorgó este umbral — no-op
    throw error;
  }

  const [referidor] = await tx.select().from(usuarios).where(eq(usuarios.id, referidorId)).limit(1);
  if (!referidor || !programa.tandaPremioId) {
    await tx.update(premiosReferidos).set({ estado: "pendiente_stock" }).where(eq(premiosReferidos.id, premioId));
    return;
  }

  // SAVEPOINT: si emitirCortesia falla (sin cupo, tanda inactiva, evento
  // cancelado), se descarta SOLO este intento — la transacción que rodea a
  // otorgarPremiosPendientes (la aprobación de la orden que gatilló todo
  // esto) tiene que seguir su curso normal.
  await tx.execute(sql`SAVEPOINT premio_intento`);
  try {
    const cortesia = await emitirCortesia(tx, {
      tandaId: programa.tandaPremioId,
      nombreComprador: `Premio referido — ${referidor.nombre}`,
      email: referidor.email,
      cedula: referidor.cedula,
      contacto: null,
      aprobadoPor: null,
    });
    await tx.execute(sql`RELEASE SAVEPOINT premio_intento`);
    await tx.update(premiosReferidos).set({ ticketCortesiaId: cortesia.id }).where(eq(premiosReferidos.id, premioId));
  } catch (error) {
    await tx.execute(sql`ROLLBACK TO SAVEPOINT premio_intento`);
    await tx.execute(sql`RELEASE SAVEPOINT premio_intento`);
    if (!(error instanceof ErrorNegocio)) throw error;
    await tx.update(premiosReferidos).set({ estado: "pendiente_stock" }).where(eq(premiosReferidos.id, premioId));
  }
}

// ============================================================================
// Programas de referidos — CRUD para el organizador
// ============================================================================

export interface DatosCrearPrograma {
  eventoId: number | undefined; // undefined = todos los eventos del organizador
  nombre: string;
  ventasRequeridas: number;
  tandaPremioId: number;
  maxPremiosPorUsuario?: number;
  montoMinimoVenta?: number;
}

export async function crearPrograma(usuario: UsuarioSesion, datos: DatosCrearPrograma): Promise<number> {
  // La tanda-premio tiene que ser del mismo organizador (y, si el programa
  // es de un evento puntual, de ESE evento).
  const [tanda] = await db
    .select({ eventoId: tandas.eventoId })
    .from(tandas)
    .where(eq(tandas.id, datos.tandaPremioId))
    .limit(1);
  if (!tanda) throw new ErrorNegocio("La tanda elegida como premio no existe.");
  if (datos.eventoId !== undefined && tanda.eventoId !== datos.eventoId) {
    throw new ErrorNegocio("La tanda-premio tiene que ser del mismo evento del programa.");
  }

  const [creado] = await db
    .insert(programasReferidos)
    .values({
      organizadorId: usuario.id,
      eventoId: datos.eventoId ?? null,
      nombre: datos.nombre,
      ventasRequeridas: datos.ventasRequeridas,
      tandaPremioId: datos.tandaPremioId,
      maxPremiosPorUsuario: datos.maxPremiosPorUsuario ?? null,
      montoMinimoVenta: datos.montoMinimoVenta ?? 1,
    })
    .returning({ id: programasReferidos.id });
  return creado.id;
}

/** Programas que aplican a este evento: los suyos propios + los "todos mis
 * eventos" del mismo organizador — mismo patrón que listarCuponesDelEvento. */
export async function listarProgramasDelEvento(eventoId: number, organizadorId: number) {
  return db
    .select()
    .from(programasReferidos)
    .where(
      and(
        eq(programasReferidos.organizadorId, organizadorId),
        sql`(${programasReferidos.eventoId} = ${eventoId} OR ${programasReferidos.eventoId} IS NULL)`,
      ),
    )
    .orderBy(desc(programasReferidos.creadoEn));
}

export async function obtenerProgramaPropio(id: number, usuario: UsuarioSesion) {
  const [programa] = await db.select().from(programasReferidos).where(eq(programasReferidos.id, id)).limit(1);
  if (!programa) throw new ErrorNegocio("Programa no encontrado.");
  if (usuario.rol !== "superadmin" && programa.organizadorId !== usuario.id) {
    throw new ErrorNegocio("Ese programa no te pertenece.");
  }
  return programa;
}

export async function cambiarEstadoPrograma(programa: typeof programasReferidos.$inferSelect, activo: boolean) {
  await db.update(programasReferidos).set({ activo }).where(eq(programasReferidos.id, programa.id));
}

export interface RankingReferidor {
  referidorId: number;
  nombre: string;
  codigoReferido: string | null;
  ventasValidas: number;
  premiosGanados: number;
}

/** Para que el organizador vea quién le está trayendo ventas. */
export async function obtenerRankingReferidos(organizadorId: number): Promise<RankingReferidor[]> {
  const { rows } = await db.execute<{
    referidor_id: number;
    nombre: string;
    codigo_referido: string | null;
    ventas_validas: number;
    premios_ganados: number;
  }>(sql`
    SELECT u.id AS referidor_id, u.nombre, u.codigo_referido,
           COUNT(DISTINCT rv.id) FILTER (WHERE rv.estado = 'valida') AS ventas_validas,
           COUNT(DISTINCT pr.id) AS premios_ganados
      FROM referidos_ventas rv
      JOIN usuarios u ON u.id = rv.referidor_id
      LEFT JOIN premios_referidos pr ON pr.referidor_id = rv.referidor_id
        AND pr.programa_id IN (SELECT id FROM programas_referidos WHERE organizador_id = ${organizadorId})
     WHERE rv.organizador_id = ${organizadorId}
     GROUP BY u.id, u.nombre, u.codigo_referido
     ORDER BY ventas_validas DESC
  `);
  return rows.map((f) => ({
    referidorId: f.referidor_id,
    nombre: f.nombre,
    codigoReferido: f.codigo_referido,
    ventasValidas: Number(f.ventas_validas),
    premiosGanados: Number(f.premios_ganados),
  }));
}
