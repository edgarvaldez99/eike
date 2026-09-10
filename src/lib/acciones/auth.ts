"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { cerrarSesion, iniciarSesion } from "@/lib/auth/sesion";
import { ipCliente, limitar } from "@/lib/rateLimit";
import { ErrorNegocio } from "@/lib/errores";
import { mensajeAmigablePg } from "@/lib/errores-pg";
import { escribirTokenCarrito, leerTokenCarrito } from "@/lib/carrito/cookie";
import { buscarCarritoParaAdoptar, obtenerCarritoUtilizablePorToken } from "@/server/carrito";
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
    // Mismo criterio que accionSegura() (que acá no se puede usar: exige
    // sesión previa y todavía no la hay). Antes esto reenviaba
    // error.message de CUALQUIER excepción — incluida una falla real de
    // conexión o de esquema con la base, cuyo mensaje trae la consulta SQL
    // cruda y sus parámetros. Bug real de seguridad, encontrado en vivo:
    // un desfasaje de una migración pendiente lo disparó con cualquier
    // intento de login, exitoso o no.
    if (error instanceof ErrorNegocio) {
      return { ok: false, error: error.message };
    }
    const amigablePg = mensajeAmigablePg(error);
    if (amigablePg) {
      return { ok: false, error: amigablePg };
    }
    console.error("Error inesperado al iniciar sesión:", error);
    return { ok: false, error: "No se pudo iniciar sesión. Probá de nuevo en un momento." };
  }

  // Fase 6 del plan de mejoras — fusión de carrito entre dispositivos:
  // si este dispositivo no tiene un carrito con nada adentro, se adopta el
  // último carrito activo de la cuenta (armado en otro dispositivo, ya
  // vinculado por vincularCarritoAUsuario). Nunca pisa un carrito que este
  // dispositivo ya venía llenando. Solo aplica a quien compra con su propia
  // cuenta (comprador/superadmin) — un organizador/staff no "compra" acá.
  if (usuario.rol === "comprador" || usuario.rol === "superadmin") {
    const tokenActual = await leerTokenCarrito();
    const carritoActual = await obtenerCarritoUtilizablePorToken(tokenActual);
    const carritoParaAdoptar = await buscarCarritoParaAdoptar(usuario.id, carritoActual);
    if (carritoParaAdoptar) {
      await escribirTokenCarrito(carritoParaAdoptar.token);
    }
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
