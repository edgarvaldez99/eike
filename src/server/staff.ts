import { randomBytes } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/cliente";
import { eventos, staffEventos, staffInvitaciones, usuarios } from "@/db/esquema";
import { ErrorNegocio } from "@/lib/errores";
import { hashearPassword } from "@/lib/auth/password";
import type { UsuarioSesion } from "@/lib/auth/sesion";

const HORAS_EXPIRACION_INVITACION = 72; // igual que config.php: staff_invitacion_horas

export interface StaffConEventos {
  id: number;
  nombre: string;
  email: string;
  estado: string;
  creadoEn: Date;
  eventosAsignados: string;
}

/** Puerto de staff.php?accion=listar. El evento (si se pasa) se usa solo como filtro. */
export async function listarStaff(usuario: UsuarioSesion, eventoIdFiltro?: number): Promise<StaffConEventos[]> {
  const esSuperadmin = usuario.rol === "superadmin";
  const { rows } = await db.execute<{
    id: number;
    nombre: string;
    email: string;
    estado: string;
    creado_en: string;
    eventos_asignados: string;
  }>(sql`
    SELECT u.id, u.nombre, u.email, u.estado, u.creado_en,
           string_agg(e.nombre, ', ' ORDER BY e.nombre) AS eventos_asignados
      FROM usuarios u
      JOIN staff_eventos se ON se.staff_id = u.id
      JOIN eventos e ON e.id = se.evento_id
     WHERE u.rol = 'staff'
       ${esSuperadmin ? sql`` : sql`AND e.organizador_id = ${usuario.id}`}
       ${eventoIdFiltro ? sql`AND u.id IN (SELECT staff_id FROM staff_eventos WHERE evento_id = ${eventoIdFiltro})` : sql``}
     GROUP BY u.id
     ORDER BY u.creado_en DESC
  `);
  return rows.map((f) => ({
    id: f.id,
    nombre: f.nombre,
    email: f.email,
    estado: f.estado,
    creadoEn: new Date(f.creado_en),
    eventosAsignados: f.eventos_asignados,
  }));
}

/** El evento ya se validó como propio/superadmin antes de llamar acá. */
export async function invitarStaff(usuario: UsuarioSesion, eventoId: number): Promise<string> {
  const token = randomBytes(24).toString("hex");
  const expiraEn = new Date(Date.now() + HORAS_EXPIRACION_INVITACION * 60 * 60 * 1000);
  await db.insert(staffInvitaciones).values({
    token,
    organizadorId: usuario.id,
    eventoId,
    expiraEn,
  });
  return token;
}

/** El staff y el evento ya se validaron como propios/superadmin antes de llamar acá. */
export async function asignarStaff(staffId: number, eventoId: number) {
  await db
    .insert(staffEventos)
    .values({ staffId, eventoId })
    .onConflictDoNothing({ target: [staffEventos.staffId, staffEventos.eventoId] });
}

export async function quitarStaffDeEvento(staffId: number, eventoId: number) {
  await db
    .delete(staffEventos)
    .where(and(eq(staffEventos.staffId, staffId), eq(staffEventos.eventoId, eventoId)));
}

export async function inactivarStaff(staffId: number) {
  await db.update(usuarios).set({ estado: "inactivo" }).where(eq(usuarios.id, staffId));
}

export async function reactivarStaff(staffId: number) {
  await db.update(usuarios).set({ estado: "activo" }).where(eq(usuarios.id, staffId));
}

export interface InvitacionVigente {
  id: number;
  token: string;
  organizadorId: number;
  eventoId: number;
  eventoNombre: string;
  organizadorNombre: string;
}

/** Puerto de staff.php::invitacionVigentePorToken. Público (landing de invitación). */
export async function obtenerInvitacionVigente(token: string): Promise<InvitacionVigente> {
  const [fila] = await db
    .select({
      id: staffInvitaciones.id,
      token: staffInvitaciones.token,
      organizadorId: staffInvitaciones.organizadorId,
      eventoId: staffInvitaciones.eventoId,
      usadoEn: staffInvitaciones.usadoEn,
      expiraEn: staffInvitaciones.expiraEn,
      eventoNombre: eventos.nombre,
      organizadorNombre: usuarios.nombre,
    })
    .from(staffInvitaciones)
    .innerJoin(eventos, eq(eventos.id, staffInvitaciones.eventoId))
    .innerJoin(usuarios, eq(usuarios.id, staffInvitaciones.organizadorId))
    .where(eq(staffInvitaciones.token, token))
    .limit(1);

  if (!fila) throw new ErrorNegocio("Invitación no encontrada.");
  if (fila.usadoEn !== null) throw new ErrorNegocio("Esta invitación ya fue utilizada.");
  if (fila.expiraEn.getTime() < Date.now()) {
    throw new ErrorNegocio("Esta invitación venció. Pedile al organizador que te envíe una nueva.");
  }
  return fila;
}

export interface DatosAceptarInvitacion {
  token: string;
  nombre: string;
  email: string;
  password: string;
}

/** Puerto de staff.php?accion=aceptar_invitacion. Crea la cuenta de staff y consume la invitación. */
export async function aceptarInvitacion(datos: DatosAceptarInvitacion): Promise<void> {
  const invitacion = await obtenerInvitacionVigente(datos.token);

  const [existente] = await db
    .select({ id: usuarios.id })
    .from(usuarios)
    .where(sql`lower(${usuarios.email}) = lower(${datos.email})`)
    .limit(1);
  if (existente) {
    throw new ErrorNegocio("Ya existe una cuenta con ese email.");
  }

  const passwordHash = await hashearPassword(datos.password);

  await db.transaction(async (tx) => {
    const [staff] = await tx
      .insert(usuarios)
      .values({
        nombre: datos.nombre,
        email: datos.email,
        passwordHash,
        rol: "staff",
        estado: "activo",
        invitadoPor: invitacion.organizadorId,
        tycAceptadoEn: new Date(),
      })
      .returning({ id: usuarios.id });

    await tx.insert(staffEventos).values({ staffId: staff.id, eventoId: invitacion.eventoId });
    await tx
      .update(staffInvitaciones)
      .set({ usadoEn: new Date() })
      .where(eq(staffInvitaciones.id, invitacion.id));
  });
}
