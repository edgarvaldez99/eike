"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { cerrarSesion, iniciarSesion } from "@/lib/auth/sesion";
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

  try {
    await iniciarSesion(parseo.data.email, parseo.data.password);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "No se pudo iniciar sesión.",
    };
  }

  redirect("/panel");
}

export async function cerrarSesionAction(): Promise<void> {
  await cerrarSesion();
  redirect("/ingresar");
}
