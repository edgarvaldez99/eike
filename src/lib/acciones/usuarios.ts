"use server";

import { redirect } from "next/navigation";
import { esquemaRegistroComprador } from "@/lib/validaciones/usuarios";
import { registrarComprador } from "@/server/usuarios";
import { iniciarSesion } from "@/lib/auth/sesion";
import { rutaInternaSegura } from "@/lib/rutas";
import { ipCliente, limitar } from "@/lib/rateLimit";
import type { ResultadoAccion } from "./marco";

/**
 * Registro público de comprador — sin sesión previa, no puede pasar por
 * accionSegura(). Puerto de usuarios.php?accion=registro_comprador, seguido
 * de un login inmediato (igual que comprador.js: registrarse y loguearse
 * son un solo paso desde la perspectiva del comprador).
 */
export async function registrarCompradorAction(
  _estadoPrevio: ResultadoAccion | null,
  fd: FormData,
): Promise<ResultadoAccion> {
  const parseo = esquemaRegistroComprador.safeParse({
    nombre: fd.get("nombre"),
    email: fd.get("email"),
    password: fd.get("password"),
    telefono: fd.get("telefono"),
    cedula: fd.get("cedula"),
    tyc_aceptado: fd.get("tyc_aceptado"),
  });
  if (!parseo.success) {
    const campos: Record<string, string> = {};
    for (const issue of parseo.error.issues) {
      const clave = issue.path.join(".") || "_general";
      if (!(clave in campos)) campos[clave] = issue.message;
    }
    return { ok: false, error: "Revisá los datos del formulario.", campos };
  }

  // El checkbox tiene "required" en el HTML, pero eso es solo del lado del
  // navegador — un POST directo (bot, curl, JS deshabilitado) lo saltea sin
  // este chequeo server-side. Mismo patrón que comprarTicketAction.
  if (!parseo.data.tyc_aceptado) {
    return {
      ok: false,
      error: "Hay que aceptar los Términos y Condiciones / Política de Privacidad.",
    };
  }

  const ip = await ipCliente();
  const { permitido, reintentarEnSegundos } = limitar(`registro:${ip}`, {
    maximo: 5,
    ventanaMs: 60 * 60 * 1000,
  });
  if (!permitido) {
    return { ok: false, error: `Demasiados intentos. Probá de nuevo en ${reintentarEnSegundos}s.` };
  }

  const volver = rutaInternaSegura(fd.get("volver"));

  try {
    await registrarComprador(parseo.data);
    await iniciarSesion(parseo.data.email, parseo.data.password);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "No se pudo crear la cuenta.",
    };
  }

  redirect(volver);
}
