import { sql } from "drizzle-orm";
import { eq } from "drizzle-orm";
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
        SELECT tk.evento_id, COUNT(*) AS tickets_vendidos, SUM(td.precio) AS ingresos
          FROM tickets tk
          JOIN tandas td ON td.id = tk.tanda_id
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

/** El evento ya se validó como propio/superadmin (ver guardas.eventoPropioODeSuperadmin) antes de llamar acá. */
export async function editarEvento(
  evento: typeof eventos.$inferSelect,
  datos: DatosEditarEvento,
) {
  if (evento.estado === "cancelado" || evento.estado === "finalizado") {
    throw new ErrorNegocio("No se puede editar un evento cancelado o finalizado.");
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

export async function publicarEvento(evento: typeof eventos.$inferSelect) {
  if (evento.estado !== "borrador") {
    throw new ErrorNegocio("Solo se puede publicar un evento en borrador.");
  }
  if (evento.esGratuito && evento.aprobacionGratuito !== "aprobado") {
    throw new ErrorNegocio("Este evento gratuito todavía no fue aprobado por el superadmin.");
  }
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)` })
    .from(tandas)
    .where(eq(tandas.eventoId, evento.id));
  if (Number(n) === 0) {
    throw new ErrorNegocio("El evento necesita al menos una tanda antes de publicarse.");
  }
  await db.update(eventos).set({ estado: "publicado" }).where(eq(eventos.id, evento.id));
}
