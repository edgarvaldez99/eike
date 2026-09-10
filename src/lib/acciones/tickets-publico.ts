"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { usuarioActual } from "@/lib/auth/sesion";
import { esquemaComprar } from "@/lib/validaciones/tickets";
import { esquemaPrevisualizarCupon } from "@/lib/validaciones/cupones";
import { prepararComprobante } from "@/lib/archivos/comprobante";
import { ipCliente, limitar } from "@/lib/rateLimit";
import { comprarTicket } from "@/server/tickets";
import { previsualizarCupon } from "@/server/cupones";
import { ErrorNegocio } from "@/lib/errores";
import { mensajeAmigablePg } from "@/lib/errores-pg";
import type { ResultadoAccion } from "./marco";

/**
 * Compra de un ticket — invitado o comprador logueado, no puede pasar por
 * accionSegura() (permite sesión ausente a propósito). Puerto de
 * tickets.php?accion=comprar.
 */
export async function comprarTicketAction(
  _estadoPrevio: ResultadoAccion | null,
  fd: FormData,
): Promise<ResultadoAccion> {
  // Por IP, no por comprador: un invitado no tiene cuenta todavía, así que
  // no hay otra identidad estable para frenar un bot reintentando compras.
  const ip = await ipCliente();
  const { permitido, reintentarEnSegundos } = limitar(`comprar:${ip}`, { maximo: 20, ventanaMs: 60 * 1000 });
  if (!permitido) {
    return { ok: false, error: `Demasiados intentos. Probá de nuevo en ${reintentarEnSegundos}s.` };
  }

  const usuario = await usuarioActual();
  // Un organizador/staff logueado no "compra" con su propia cuenta (igual que el PHP).
  const compradorSesion = usuario && (usuario.rol === "comprador" || usuario.rol === "superadmin") ? usuario : null;

  const parseo = esquemaComprar.safeParse({
    evento_id: fd.get("evento_id"),
    tanda_id: fd.get("tanda_id"),
    nombre_comprador: fd.get("nombre_comprador"),
    cedula: fd.get("cedula"),
    email: fd.get("email"),
    contacto: fd.get("contacto"),
    asiento_id: fd.get("asiento_id"),
    tyc_aceptado: fd.get("tyc_aceptado"),
    comprobante_texto: fd.get("comprobante_texto"),
    codigo_cupon: fd.get("codigo_cupon"),
  });
  if (!parseo.success) {
    const campos: Record<string, string> = {};
    for (const issue of parseo.error.issues) {
      const clave = issue.path.join(".") || "_general";
      if (!(clave in campos)) campos[clave] = issue.message;
    }
    return { ok: false, error: "Revisá los datos del formulario.", campos };
  }

  // Un comprador con cuenta ya aceptó los T&C al registrarse; un invitado los acepta acá.
  if (!compradorSesion && !parseo.data.tyc_aceptado) {
    return {
      ok: false,
      error: "Hay que aceptar los Términos y Condiciones / Política de Privacidad.",
    };
  }

  const archivoCrudo = fd.get("comprobante");
  const tieneArchivo = archivoCrudo instanceof File && archivoCrudo.size > 0;
  // Fase 8: la atribución de referido viaja en una cookie de solo lectura
  // (ver proxy.ts) — nunca en el propio form, para que no se pueda
  // falsear editando el HTML de la página.
  const codigoReferido = (await cookies()).get("eike_ref")?.value ?? null;

  let codigo: string;
  try {
    const comprobante = tieneArchivo ? await prepararComprobante(archivoCrudo as File) : null;
    const ticket = await comprarTicket(compradorSesion?.id ?? null, {
      eventoId: parseo.data.evento_id,
      tandaId: parseo.data.tanda_id,
      nombreComprador: parseo.data.nombre_comprador,
      cedula: parseo.data.cedula,
      email: parseo.data.email,
      contacto: parseo.data.contacto,
      asientoId: parseo.data.asiento_id ?? null,
      comprobanteTexto: parseo.data.comprobante_texto,
      comprobante,
      codigoCupon: parseo.data.codigo_cupon,
      codigoReferido,
    });
    codigo = ticket.codigo;
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
    console.error("Error inesperado al completar una compra:", error);
    return { ok: false, error: "No se pudo completar la compra. Probá de nuevo en un momento." };
  }

  redirect(`/entradas/${codigo}`);
}

/**
 * Previsualización de cupón (Fase 7 del plan de mejoras) — de solo lectura,
 * NO consume el cupón. Se llama directo desde un evento de clic del
 * cliente (no es un <form action>, así que no pasa por useActionState);
 * Next la trata igual que cualquier Server Function.
 *
 * Es autoritativa solo para mostrar el total antes de transferir: el
 * consumo real y el chequeo de cupo ocurren de nuevo, atómicamente, dentro
 * de comprarTicket — si el cupón se agotó entre esta previsualización y el
 * submit, la compra falla en vez de cobrar de más en silencio.
 */
export async function previsualizarCuponAction(datos: {
  eventoId: number;
  tandaId: number;
  codigo: string;
}): Promise<{ ok: true; descuento: number; total: number } | { ok: false; error: string }> {
  // Sin la fricción de subir un archivo (a diferencia de la compra real),
  // probar códigos acá es mucho más barato para un bot — límite propio.
  const ip = await ipCliente();
  const { permitido, reintentarEnSegundos } = limitar(`cupon-preview:${ip}`, { maximo: 20, ventanaMs: 60 * 1000 });
  if (!permitido) {
    return { ok: false, error: `Demasiados intentos. Probá de nuevo en ${reintentarEnSegundos}s.` };
  }

  const parseo = esquemaPrevisualizarCupon.safeParse({
    evento_id: datos.eventoId,
    tanda_id: datos.tandaId,
    codigo: datos.codigo,
  });
  if (!parseo.success) {
    return { ok: false, error: "Código inválido." };
  }

  try {
    const previa = await previsualizarCupon({
      eventoId: parseo.data.evento_id,
      tandaId: parseo.data.tanda_id,
      codigo: parseo.data.codigo,
    });
    return { ok: true, descuento: previa.descuento, total: previa.total };
  } catch (error) {
    if (error instanceof ErrorNegocio) {
      return { ok: false, error: error.message };
    }
    const amigablePg = mensajeAmigablePg(error);
    if (amigablePg) {
      return { ok: false, error: amigablePg };
    }
    console.error("Error inesperado al previsualizar un cupón:", error);
    return { ok: false, error: "No se pudo validar el cupón. Probá de nuevo en un momento." };
  }
}
