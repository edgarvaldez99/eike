import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/cliente";
import { eventos, tandas, usuarios } from "@/db/esquema";
import { ErrorNegocio } from "@/lib/errores";
import type { UsuarioSesion } from "@/lib/auth/sesion";
import type { EstadoEvento } from "@/lib/constantes";

export interface EventoConMetricas {
  id: number;
  nombre: string;
  fechaEvento: Date;
  lugar: string | null;
  aficheUrl: string | null;
  estado: EstadoEvento;
  esGratuito: boolean;
  aforoTotal: number | null;
  organizadorNombre: string;
  tandasCreadas: number;
  ticketsVendidos: number;
  ingresos: number;
}

/** Puerto de eventos.php?accion=mis_eventos — organizador ve los suyos, superadmin ve todos. */
export async function obtenerMisEventos(usuario: UsuarioSesion): Promise<EventoConMetricas[]> {
  const esSuperadmin = usuario.rol === "superadmin";

  // OJO: db.execute() (a diferencia de db.select() tipado) NO parsea timestamps
  // a Date — Drizzle deliberadamente devuelve el string crudo de Postgres acá
  // y deja el parseo a su propio mapeo de columnas, que no aplica en SQL a
  // mano. Por eso fecha_evento llega como string y se convierte abajo.
  const { rows } = await db.execute<{
    id: number;
    nombre: string;
    fecha_evento: string;
    lugar: string | null;
    afiche_url: string | null;
    estado: EstadoEvento;
    es_gratuito: boolean;
    aforo_total: number | null;
    organizador_nombre: string;
    tandas_creadas: number;
    tickets_vendidos: number;
    ingresos: number;
  }>(sql`
    SELECT e.id, e.nombre, e.fecha_evento, e.lugar, e.afiche_url, e.estado, e.es_gratuito, e.aforo_total,
           u.nombre AS organizador_nombre,
           COALESCE(t.tandas_creadas, 0) AS tandas_creadas,
           COALESCE(v.tickets_vendidos, 0) AS tickets_vendidos,
           COALESCE(v.ingresos, 0) AS ingresos
      FROM eventos e
      JOIN usuarios u ON u.id = e.organizador_id
      LEFT JOIN (
        SELECT evento_id, COUNT(*) AS tandas_creadas FROM tandas GROUP BY evento_id
      ) t ON t.evento_id = e.id
      LEFT JOIN (
        SELECT tk.evento_id, COUNT(*) AS tickets_vendidos, SUM(tk.precio_pagado) AS ingresos
          FROM tickets tk
         WHERE tk.estado IN ('disponible', 'usado')
         GROUP BY tk.evento_id
      ) v ON v.evento_id = e.id
     ${esSuperadmin ? sql`` : sql`WHERE e.organizador_id = ${usuario.id}`}
     ORDER BY e.fecha_evento DESC
  `);

  return rows.map((f) => ({
    id: f.id,
    nombre: f.nombre,
    fechaEvento: new Date(f.fecha_evento),
    lugar: f.lugar,
    aficheUrl: f.afiche_url,
    estado: f.estado,
    esGratuito: f.es_gratuito,
    aforoTotal: f.aforo_total,
    organizadorNombre: f.organizador_nombre,
    tandasCreadas: Number(f.tandas_creadas),
    ticketsVendidos: Number(f.tickets_vendidos),
    ingresos: Number(f.ingresos),
  }));
}

/** Puerto de eventos.php?accion=detalle: evento + sus tandas + nombre del organizador. */
export async function obtenerEventoConTandas(eventoId: number) {
  const [evento] = await db.select().from(eventos).where(eq(eventos.id, eventoId)).limit(1);
  if (!evento) return null;

  const [organizador] = await db
    .select({ nombre: usuarios.nombre })
    .from(usuarios)
    .where(eq(usuarios.id, evento.organizadorId))
    .limit(1);

  const filasTandas = await db
    .select()
    .from(tandas)
    .where(eq(tandas.eventoId, eventoId))
    .orderBy(tandas.id);

  return { ...evento, organizadorNombre: organizador?.nombre ?? "—", tandas: filasTandas };
}

export interface EventoPublico {
  id: number;
  nombre: string;
  descripcion: string | null;
  fechaEvento: Date;
  lugar: string | null;
  aficheUrl: string | null;
  esGratuito: boolean;
  organizadorNombre: string;
}

/** Puerto de eventos.php?accion=publicos. Solo eventos publicados y no vencidos. */
export async function obtenerEventosPublicos(): Promise<EventoPublico[]> {
  const { rows } = await db.execute<{
    id: number;
    nombre: string;
    descripcion: string | null;
    fecha_evento: string;
    lugar: string | null;
    afiche_url: string | null;
    es_gratuito: boolean;
    organizador_nombre: string;
  }>(sql`
    SELECT e.id, e.nombre, e.descripcion, e.fecha_evento, e.lugar, e.afiche_url, e.es_gratuito,
           u.nombre AS organizador_nombre
      FROM eventos e
      JOIN usuarios u ON u.id = e.organizador_id
     WHERE e.estado = 'publicado' AND e.fecha_evento >= now()
     ORDER BY e.fecha_evento ASC
  `);
  return rows.map((f) => ({
    id: f.id,
    nombre: f.nombre,
    descripcion: f.descripcion,
    fechaEvento: new Date(f.fecha_evento),
    lugar: f.lugar,
    aficheUrl: f.afiche_url,
    esGratuito: f.es_gratuito,
    organizadorNombre: f.organizador_nombre,
  }));
}

export interface TandaPublica {
  id: number;
  nombre: string;
  tipo: "general" | "numerada";
  precio: number;
  disponibles: number;
}

export interface EventoPublicoDetalle extends EventoPublico {
  tandas: TandaPublica[];
}

/** Puerto de eventos.php?accion=publico_detalle. Null si no existe o no está publicado. */
export async function obtenerEventoPublicoPorId(id: number): Promise<EventoPublicoDetalle | null> {
  const [evento] = await db
    .select()
    .from(eventos)
    .where(and(eq(eventos.id, id), eq(eventos.estado, "publicado")))
    .limit(1);
  if (!evento) return null;

  const [organizador] = await db
    .select({ nombre: usuarios.nombre })
    .from(usuarios)
    .where(eq(usuarios.id, evento.organizadorId))
    .limit(1);

  const filasTandas = await db
    .select({
      id: tandas.id,
      nombre: tandas.nombre,
      tipo: tandas.tipo,
      precio: tandas.precio,
      // Fase 6 del plan de mejoras: lo reservado en carritos activos
      // también descuenta del disponible público, no solo lo ya vendido —
      // si no, dos personas verían el mismo último cupo "libre" a la vez.
      disponibles: sql<number>`${tandas.cantidadTotal} - ${tandas.cantidadVendida} - ${tandas.cantidadReservada}`,
    })
    .from(tandas)
    // "agotada" sigue visible (con el cartel "Agotado" ya implementado en la
    // página) — genera urgencia y el JSON-LD sigue publicando SoldOut a
    // Google. Del público solo desaparece "inactiva" (ocultada a mano).
    .where(and(eq(tandas.eventoId, id), inArray(tandas.estado, ["activa", "agotada"])))
    .orderBy(tandas.precio);

  return {
    id: evento.id,
    nombre: evento.nombre,
    descripcion: evento.descripcion,
    fechaEvento: evento.fechaEvento,
    lugar: evento.lugar,
    aficheUrl: evento.aficheUrl,
    esGratuito: evento.esGratuito,
    organizadorNombre: organizador?.nombre ?? "—",
    tandas: filasTandas.map((t) => ({ ...t, disponibles: Number(t.disponibles) })),
  };
}

export interface DatosCrearEvento {
  nombre: string;
  descripcion: string | null;
  fechaEvento: Date;
  lugar: string | null;
  aforoTotal: number | null;
  esGratuito: boolean;
}

export async function crearEvento(usuario: UsuarioSesion, datos: DatosCrearEvento) {
  const [creado] = await db
    .insert(eventos)
    .values({
      organizadorId: usuario.id,
      nombre: datos.nombre,
      descripcion: datos.descripcion,
      fechaEvento: datos.fechaEvento,
      lugar: datos.lugar,
      aforoTotal: datos.aforoTotal,
      esGratuito: datos.esGratuito,
      // aprobacionGratuito queda por compatibilidad de esquema, pero está
      // superada: la aprobación general de eventos (estado
      // 'pendiente_aprobacion'/'rechazado', ver solicitarAprobacionEvento
      // más abajo) ya cubre a TODO evento, gratuito o no — nada vuelve a
      // leer esta columna.
      aprobacionGratuito: datos.esGratuito ? "pendiente" : "no_aplica",
      estado: "borrador",
    })
    .returning({ id: eventos.id });
  return creado.id;
}

export interface DatosEditarEvento {
  nombre: string;
  descripcion: string | null;
  fechaEvento: Date;
  lugar: string | null;
  aforoTotal: number | null;
}

/** El evento ya se validó como propio/superadmin (ver guardas.eventoPropioODeSuperadmin)
 * Y como editable (ver guardas.verificarEventoEditable) antes de llamar acá
 * — repetido acá como defensa en profundidad, mismo criterio que crearTanda. */
export async function editarEvento(
  evento: typeof eventos.$inferSelect,
  datos: DatosEditarEvento,
) {
  if (evento.estado !== "borrador" && evento.estado !== "rechazado") {
    throw new ErrorNegocio("Este evento no se puede editar en su estado actual.");
  }
  // es_gratuito solo se fija al crear (ver comentario en eventos.php): cambiarlo
  // después reabriría la aprobación del superadmin sobre un evento que ya
  // podría tener ventas.
  await db
    .update(eventos)
    .set({
      nombre: datos.nombre,
      descripcion: datos.descripcion,
      fechaEvento: datos.fechaEvento,
      lugar: datos.lugar,
      aforoTotal: datos.aforoTotal,
    })
    .where(eq(eventos.id, evento.id));
}

/**
 * Solicitar aprobación (antes: "publicar" directo) — pedido anti-estafa:
 * de acá en más ningún evento se publica sin que el superadmin lo revise.
 * A partir de este punto el evento queda de solo lectura (ver
 * guardas.verificarEventoEditable) hasta que se apruebe o se rechace.
 */
export async function solicitarAprobacionEvento(evento: typeof eventos.$inferSelect) {
  if (evento.estado !== "borrador" && evento.estado !== "rechazado") {
    throw new ErrorNegocio("Solo se puede solicitar aprobación de un evento en borrador o rechazado.");
  }
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)` })
    .from(tandas)
    .where(eq(tandas.eventoId, evento.id));
  if (Number(n) === 0) {
    throw new ErrorNegocio("El evento necesita al menos una tanda antes de solicitar aprobación.");
  }
  // Limpia un motivo de rechazo anterior: es un pedido nuevo.
  await db
    .update(eventos)
    .set({ estado: "pendiente_aprobacion", motivoRechazo: null })
    .where(eq(eventos.id, evento.id));
}

/** Solo superadmin (validado en la Server Action, no acá — mismo criterio
 * que aprobarOrganizador). Deja el evento en venta. */
export async function aprobarEvento(evento: typeof eventos.$inferSelect) {
  if (evento.estado !== "pendiente_aprobacion") {
    throw new ErrorNegocio("Solo se puede aprobar un evento pendiente de aprobación.");
  }
  await db
    .update(eventos)
    .set({ estado: "publicado", motivoRechazo: null })
    .where(eq(eventos.id, evento.id));
}

/** Solo superadmin. El evento vuelve a ser editable (ver
 * guardas.verificarEventoEditable) para que el organizador corrija lo que
 * el motivo señale y vuelva a solicitar aprobación. */
export async function rechazarEvento(evento: typeof eventos.$inferSelect, motivo: string) {
  if (evento.estado !== "pendiente_aprobacion") {
    throw new ErrorNegocio("Solo se puede rechazar un evento pendiente de aprobación.");
  }
  await db.update(eventos).set({ estado: "rechazado", motivoRechazo: motivo }).where(eq(eventos.id, evento.id));
}

// ============================================================================
// Superadmin — puerto de eventos.php
// ============================================================================

export interface EventoGlobal {
  id: number;
  nombre: string;
  fechaEvento: Date;
  lugar: string | null;
  estado: EstadoEvento;
  esGratuito: boolean;
  motivoRechazo: string | null;
  organizadorId: number;
  organizadorNombre: string;
  ticketsVendidos: number;
  ingresos: number;
  sobrantes: number;
}

/** Puerto de eventos.php?accion=listar (superadmin: todos los eventos de la plataforma). */
export async function obtenerEventosGlobal(): Promise<EventoGlobal[]> {
  const { rows } = await db.execute<{
    id: number;
    nombre: string;
    fecha_evento: string;
    lugar: string | null;
    estado: EstadoEvento;
    es_gratuito: boolean;
    motivo_rechazo: string | null;
    organizador_id: number;
    organizador_nombre: string;
    tickets_vendidos: number;
    ingresos: number;
    sobrantes: number;
  }>(sql`
    SELECT e.id, e.nombre, e.fecha_evento, e.lugar, e.estado, e.es_gratuito, e.motivo_rechazo,
           u.id AS organizador_id, u.nombre AS organizador_nombre,
           COALESCE(v.tickets_vendidos, 0) AS tickets_vendidos,
           COALESCE(v.ingresos, 0) AS ingresos,
           COALESCE(s.sobrantes, 0) AS sobrantes
      FROM eventos e
      JOIN usuarios u ON u.id = e.organizador_id
      LEFT JOIN (
        SELECT t.evento_id, COUNT(*) AS tickets_vendidos, SUM(t.precio_pagado) AS ingresos
          FROM tickets t
         WHERE t.estado IN ('disponible', 'usado')
         GROUP BY t.evento_id
      ) v ON v.evento_id = e.id
      LEFT JOIN (
        SELECT evento_id, SUM(cantidad_total - cantidad_vendida) AS sobrantes
          FROM tandas
         GROUP BY evento_id
      ) s ON s.evento_id = e.id
     ORDER BY e.fecha_evento DESC
  `);
  return rows.map((f) => ({
    id: f.id,
    nombre: f.nombre,
    fechaEvento: new Date(f.fecha_evento),
    lugar: f.lugar,
    estado: f.estado,
    esGratuito: f.es_gratuito,
    motivoRechazo: f.motivo_rechazo,
    organizadorId: f.organizador_id,
    organizadorNombre: f.organizador_nombre,
    ticketsVendidos: Number(f.tickets_vendidos),
    ingresos: Number(f.ingresos),
    sobrantes: Number(f.sobrantes),
  }));
}

export interface RankingOrganizador {
  organizadorId: number;
  nombre: string;
  email: string;
  ticketsVendidos: number;
  ingresos: number;
}

/** Puerto de eventos.php?accion=ranking_organizadores. */
export async function obtenerRankingOrganizadores(): Promise<RankingOrganizador[]> {
  const { rows } = await db.execute<{
    organizador_id: number;
    nombre: string;
    email: string;
    tickets_vendidos: number;
    ingresos: number;
  }>(sql`
    SELECT u.id AS organizador_id, u.nombre, u.email,
           COUNT(tk.id) AS tickets_vendidos,
           COALESCE(SUM(tk.precio_pagado), 0) AS ingresos
      FROM usuarios u
      LEFT JOIN eventos e ON e.organizador_id = u.id
      LEFT JOIN tickets tk ON tk.evento_id = e.id AND tk.estado IN ('disponible', 'usado')
     WHERE u.rol = 'organizador'
     GROUP BY u.id
     ORDER BY ingresos DESC, tickets_vendidos DESC
     LIMIT 20
  `);
  return rows.map((f) => ({
    organizadorId: f.organizador_id,
    nombre: f.nombre,
    email: f.email,
    ticketsVendidos: Number(f.tickets_vendidos),
    ingresos: Number(f.ingresos),
  }));
}
