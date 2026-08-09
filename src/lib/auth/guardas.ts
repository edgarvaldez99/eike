import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/cliente";
import { eventos, staffEventos, tandas, usuarios } from "@/db/esquema";
import type { Rol } from "@/lib/constantes";
import { usuarioActual, type UsuarioSesion } from "./sesion";

/**
 * Errores de autorización pensados para Server Actions (los captura
 * accionSegura() y se muestran como el `error` del formulario — nunca deben
 * llegar a un error boundary genérico). Para Server Components se usa
 * requerirSesion(), que redirige en vez de lanzar.
 */
export class ErrorAutorizacion extends Error {}

/**
 * Para Server Components / layouts de panel: exige sesión activa y,
 * opcionalmente, que el rol esté en la lista. Redirige en vez de lanzar
 * porque un layout no tiene forma linda de "mostrar" un error 401/403.
 * Puerto de requerirSesion() de api/auth.php.
 */
export async function requerirSesion(rolesPermitidos?: Rol[]): Promise<UsuarioSesion> {
  const usuario = await usuarioActual();
  if (!usuario) {
    redirect("/ingresar");
  }
  if (rolesPermitidos && !rolesPermitidos.includes(usuario.rol)) {
    redirect("/");
  }
  return usuario;
}

/** Misma exigencia, pero para Server Actions y Route Handlers: lanza en vez de redirigir. */
export async function requerirSesionAccion(rolesPermitidos?: Rol[]): Promise<UsuarioSesion> {
  const usuario = await usuarioActual();
  if (!usuario) {
    throw new ErrorAutorizacion("No autenticado.");
  }
  if (rolesPermitidos && !rolesPermitidos.includes(usuario.rol)) {
    throw new ErrorAutorizacion("No autorizado para esta acción.");
  }
  return usuario;
}

/**
 * El evento existe y (el usuario es superadmin) o (es el organizador dueño).
 * Puerto único de la comprobación que en el PHP estaba duplicada 4 veces
 * (eventos.php, tandas.php, tickets.php, staff.php) con matices distintos.
 */
export async function eventoPropioODeSuperadmin(eventoId: number, usuario: UsuarioSesion) {
  const [evento] = await db.select().from(eventos).where(eq(eventos.id, eventoId)).limit(1);
  if (!evento) {
    throw new ErrorAutorizacion("Ese evento no existe.");
  }
  if (usuario.rol !== "superadmin" && evento.organizadorId !== usuario.id) {
    throw new ErrorAutorizacion("Ese evento no te pertenece.");
  }
  return evento;
}

/** La tanda existe y su evento le pertenece al usuario (o es superadmin). */
export async function tandaPropia(tandaId: number, usuario: UsuarioSesion) {
  const [tanda] = await db.select().from(tandas).where(eq(tandas.id, tandaId)).limit(1);
  if (!tanda) {
    throw new ErrorAutorizacion("Esa tanda no existe.");
  }
  await eventoPropioODeSuperadmin(tanda.eventoId, usuario);
  return tanda;
}

/**
 * Puede escanear el evento: superadmin (todos), organizador (los suyos),
 * staff (solo los que tiene asignados en staff_eventos). Puerto de
 * escaner.php::verificarAccesoAlEvento.
 */
export async function puedeEscanearEvento(eventoId: number, usuario: UsuarioSesion): Promise<boolean> {
  const [evento] = await db.select().from(eventos).where(eq(eventos.id, eventoId)).limit(1);
  if (!evento) return false;

  if (usuario.rol === "superadmin") return true;
  if (usuario.rol === "organizador") return evento.organizadorId === usuario.id;
  if (usuario.rol === "staff") {
    const [asignacion] = await db
      .select()
      .from(staffEventos)
      .where(and(eq(staffEventos.staffId, usuario.id), eq(staffEventos.eventoId, eventoId)))
      .limit(1);
    return asignacion !== undefined;
  }
  return false;
}

/**
 * El staff existe y está asignado a al menos un evento del organizador (o es
 * superadmin). Puerto de staff.php::staffPropio.
 */
export async function staffPropio(staffId: number, usuario: UsuarioSesion) {
  if (usuario.rol === "superadmin") {
    const [staff] = await db
      .select()
      .from(usuarios)
      .where(and(eq(usuarios.id, staffId), eq(usuarios.rol, "staff")))
      .limit(1);
    if (!staff) throw new ErrorAutorizacion("Ese miembro de staff no existe.");
    return staff;
  }

  const [fila] = await db
    .selectDistinct({
      id: usuarios.id,
      nombre: usuarios.nombre,
      email: usuarios.email,
      rol: usuarios.rol,
      estado: usuarios.estado,
      creadoEn: usuarios.creadoEn,
    })
    .from(usuarios)
    .innerJoin(staffEventos, eq(staffEventos.staffId, usuarios.id))
    .innerJoin(eventos, eq(eventos.id, staffEventos.eventoId))
    .where(
      and(eq(usuarios.id, staffId), eq(usuarios.rol, "staff"), eq(eventos.organizadorId, usuario.id)),
    )
    .limit(1);

  if (!fila) {
    throw new ErrorAutorizacion("Ese miembro de staff no está asignado a ninguno de tus eventos.");
  }
  return fila;
}
