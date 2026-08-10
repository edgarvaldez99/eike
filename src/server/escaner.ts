import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/cliente";
import { tickets } from "@/db/esquema";
import type { UsuarioSesion } from "@/lib/auth/sesion";

export interface EventoEscaneable {
  id: number;
  nombre: string;
  fechaEvento: Date;
  lugar: string | null;
  estado: string;
}

/** Puerto de escaner.php?accion=eventos_escaneables. */
export async function obtenerEventosEscaneables(usuario: UsuarioSesion): Promise<EventoEscaneable[]> {
  const { rows } = await db.execute<{
    id: number;
    nombre: string;
    fecha_evento: string;
    lugar: string | null;
    estado: string;
  }>(sql`
    SELECT e.id, e.nombre, e.fecha_evento, e.lugar, e.estado
      FROM eventos e
      ${usuario.rol === "staff" ? sql`JOIN staff_eventos se ON se.evento_id = e.id AND se.staff_id = ${usuario.id}` : sql``}
     WHERE e.estado IN ('publicado', 'reprogramado')
       ${usuario.rol === "organizador" ? sql`AND e.organizador_id = ${usuario.id}` : sql``}
     ORDER BY e.fecha_evento
  `);
  return rows.map((f) => ({
    id: f.id,
    nombre: f.nombre,
    fechaEvento: new Date(f.fecha_evento),
    lugar: f.lugar,
    estado: f.estado,
  }));
}

export type ResultadoValidacion = "ok" | "ya_usado" | "anulado" | "pendiente" | "invalido";

export interface RespuestaValidacion {
  resultado: ResultadoValidacion;
  mensaje: string;
  datos?: {
    nombreComprador: string;
    cedula: string | null;
    tandaNombre: string;
    asientoIdentificador: string | null;
  };
}

/**
 * Puerto de escaner.php?accion=validar, con una mejora real: en vez de
 * SELECT -> chequear en la app -> UPDATE (una carrera real: dos puertas
 * podrían marcar "ok" para el mismo código en la misma ventana), acá el
 * UPDATE condicional es atómico — solo una de las dos gana la fila.
 */
export async function validarTicket(codigo: string, eventoId: number): Promise<RespuestaValidacion> {
  // El intento de marcar "usado" es atómico: si dos escaneos llegan a la vez
  // para el mismo código, solo uno de los dos UPDATE afecta una fila.
  const actualizados = await db
    .update(tickets)
    .set({ estado: "usado", horaIngreso: sql`now()` })
    .where(and(eq(tickets.codigo, codigo), eq(tickets.eventoId, eventoId), eq(tickets.estado, "disponible")))
    .returning();

  if (actualizados.length > 0) {
    const datos = await datosParaMostrar(actualizados[0].id);
    return { resultado: "ok", mensaje: "Acceso permitido.", datos };
  }

  // El UPDATE no afectó ninguna fila: diagnosticar por qué (inexistente,
  // de otro evento, ya usado, anulado, o todavía pendiente de aprobación).
  const [ticket] = await db.select().from(tickets).where(eq(tickets.codigo, codigo)).limit(1);
  if (!ticket) {
    return { resultado: "invalido", mensaje: "Ticket inexistente." };
  }

  const datos = await datosParaMostrar(ticket.id);

  if (ticket.eventoId !== eventoId) {
    return { resultado: "invalido", mensaje: "Este ticket no es de este evento.", datos };
  }
  if (ticket.estado === "usado") {
    const hora = ticket.horaIngreso ? ticket.horaIngreso.toISOString() : "";
    return { resultado: "ya_usado", mensaje: `Esta entrada ya fue escaneada (${hora}).`, datos };
  }
  if (ticket.estado === "anulado") {
    return { resultado: "anulado", mensaje: "Esta entrada fue anulada.", datos };
  }
  if (ticket.estado === "pendiente") {
    return { resultado: "pendiente", mensaje: "Todavía no se aprobó el pago de esta entrada.", datos };
  }
  return { resultado: "invalido", mensaje: "Ticket inválido." };
}

async function datosParaMostrar(ticketId: number): Promise<RespuestaValidacion["datos"]> {
  const { rows } = await db.execute<{
    nombre_comprador: string;
    cedula: string | null;
    tanda_nombre: string;
    asiento_identificador: string | null;
  }>(sql`
    SELECT tk.nombre_comprador, tk.cedula, td.nombre AS tanda_nombre, a.identificador AS asiento_identificador
      FROM tickets tk
      JOIN tandas td ON td.id = tk.tanda_id
      LEFT JOIN asientos a ON a.id = tk.asiento_id
     WHERE tk.id = ${ticketId}
  `);
  const f = rows[0];
  if (!f) return undefined;
  return {
    nombreComprador: f.nombre_comprador,
    cedula: f.cedula,
    tandaNombre: f.tanda_nombre,
    asientoIdentificador: f.asiento_identificador,
  };
}
