"use server";

import { revalidatePath } from "next/cache";
import { usuarioActual } from "@/lib/auth/sesion";
import { obtenerOCrearCodigoReferido } from "@/server/referidos";
import { cambiarPasswordPropio, editarAliasBancario, editarPerfilPropio } from "@/server/cuenta";
import {
  esquemaCambiarPassword,
  esquemaEditarAliasBancario,
  esquemaEditarPerfil,
} from "@/lib/validaciones/cuenta";
import { accionSegura } from "./marco";

/**
 * Código de referido del visitante actual, o null si no está logueado.
 * Server Function llamada directo desde un evento de clic/mount del
 * cliente (BotonCompartir) — a propósito NO se lee acá dentro de la página
 * del evento (Server Component): esa página tiene ISR (revalidate=60,
 * SEO-crítica) y leer la sesión ahí la volvería dinámica para TODOS los
 * visitantes, logueados o no. Consultarlo del lado del cliente evita
 * romper esa caché por una personalización que ni siquiera aplica a la
 * mayoría de las visitas (invitados anónimos).
 */
export async function obtenerMiCodigoReferidoAction(): Promise<string | null> {
  const usuario = await usuarioActual();
  if (!usuario) return null;
  return obtenerOCrearCodigoReferido(usuario.id);
}

/** Sin roles: cualquier usuario logueado edita SU PROPIO perfil. */
export const editarPerfilAction = accionSegura({
  esquema: esquemaEditarPerfil,
  ejecutar: async (datos, usuario) => {
    await editarPerfilPropio(usuario.id, datos);
    revalidatePath("/panel/cuenta");
  },
});

/** Sin roles: cualquier usuario logueado cambia SU PROPIA contraseña
 * (exige la actual — ver server/cuenta.ts::cambiarPasswordPropio). */
export const cambiarPasswordAction = accionSegura({
  esquema: esquemaCambiarPassword,
  ejecutar: async (datos, usuario) => {
    await cambiarPasswordPropio(usuario.id, datos.password_actual, datos.password_nueva);
  },
});

/** Solo superadmin — alias bancario de la plataforma (ver server/cuenta.ts). */
export const editarAliasBancarioAction = accionSegura({
  esquema: esquemaEditarAliasBancario,
  roles: ["superadmin"],
  ejecutar: async (datos, usuario) => {
    await editarAliasBancario(usuario.id, { tipo: datos.alias_bancario_tipo, valor: datos.alias_bancario_valor });
    revalidatePath("/panel/cuenta");
  },
});
