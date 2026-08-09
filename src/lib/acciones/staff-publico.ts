"use server";

import { redirect } from "next/navigation";
import { esquemaAceptarInvitacion } from "@/lib/validaciones/staff";
import * as servidorStaff from "@/server/staff";
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
    return {
      ok: false,
      error: error instanceof Error ? error.message : "No se pudo aceptar la invitación.",
    };
  }

  redirect("/ingresar");
}
