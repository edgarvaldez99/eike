"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { cerrarSesion, iniciarSesion } from "@/lib/auth/sesion";
import { ipCliente, limitar } from "@/lib/rateLimit";
import type { ResultadoAccion } from "./marco";

/**
 * Login/logout no usan accionSegura() (ese wrapper exige una sesión previa
 * — acá todavía no la hay). Puerto de auth.php: acción login/logout.
 */
const esquemaLogin = z.object({
  email: z.string().trim().min(1, "Ingresá tu email.").pipe(z.email("Ese email no parece válido.")),
  password: z.string().min(1, "Ingresá tu contraseña."),
});

export async function iniciarSesionAction(
  _estadoPrevio: ResultadoAccion | null,
  fd: FormData,
): Promise<ResultadoAccion> {
  const parseo = esquemaLogin.safeParse({
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

  // Por IP+email (no solo IP): así un ataque de fuerza bruta contra UNA
  // cuenta se frena sin bloquear a todos los demás usuarios detrás de la
  // misma IP (oficinas, redes móviles compartidas, etc.).
  const ip = await ipCliente();
  const { permitido, reintentarEnSegundos } = limitar(`login:${ip}:${parseo.data.email.toLowerCase()}`, {
    maximo: 8,
    ventanaMs: 10 * 60 * 1000,
  });
  if (!permitido) {
    return {
      ok: false,
      error: `Demasiados intentos. Probá de nuevo en ${reintentarEnSegundos}s.`,
    };
  }

  let usuario;
  try {
    usuario = await iniciarSesion(parseo.data.email, parseo.data.password);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "No se pudo iniciar sesión.",
    };
  }

  // organizador/superadmin -> su panel de eventos; comprador -> sus entradas;
  // staff -> el escáner (Fase 6, todavía no existe: cae al panel genérico).
  if (usuario.rol === "organizador" || usuario.rol === "superadmin") {
    redirect("/panel/organizador");
  }
  if (usuario.rol === "comprador") {
    redirect("/panel/mis-entradas");
  }
  redirect("/panel");
}

export async function cerrarSesionAction(): Promise<void> {
  await cerrarSesion();
  redirect("/ingresar");
}
