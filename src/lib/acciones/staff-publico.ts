"use server";

import { redirect } from "next/navigation";
import { esquemaAceptarInvitacion } from "@/lib/validaciones/staff";
import * as servidorStaff from "@/server/staff";
import { ErrorNegocio } from "@/lib/errores";
import { mensajeAmigablePg } from "@/lib/errores-pg";
import type { ResultadoAccion } from "./marco";

/**
 * Aceptar una invitación de staff es público (no hay sesión todavía — la
 * cuenta se crea acá mismo), así que no puede pasar por accionSegura().
 * Puerto de staff.php?accion=aceptar_invitacion.
 */
export async function aceptarInvitacionAction(
  _estadoPrevio: ResultadoAccion | null,
  fd: FormData,
): Promise<ResultadoAccion> {
  const parseo = esquemaAceptarInvitacion.safeParse({
    token: fd.get("token"),
    nombre: fd.get("nombre"),
    email: fd.get("email"),
    password: fd.get("password"),
  });
  if (!parseo.success) {
    const campos: Record<string, string> = {};
    for (const issue of parseo.error.issues) {
      const clave = issue.path.join(".") || "_general";
      if (!(clave in campos)) campos[clave] = issue.message;
    }
    return { ok: false, error: "Revisá los datos del formulario.", campos };
  }

  try {
    await servidorStaff.aceptarInvitacion(parseo.data);
  } catch (error) {
    // Nunca reenviar error.message de un error inesperado tal cual — ver
    // el bug real encontrado en iniciarSesionAction() (auth.ts).
    if (error instanceof ErrorNegocio) {
      return { ok: false, error: error.message };
    }
    const amigablePg = mensajeAmigablePg(error);
    if (amigablePg) {
      return { ok: false, error: amigablePg };
    }
    console.error("Error inesperado al aceptar una invitación de staff:", error);
    return { ok: false, error: "No se pudo aceptar la invitación. Probá de nuevo en un momento." };
  }

  redirect("/ingresar");
}
