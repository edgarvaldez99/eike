"use server";

import { redirect } from "next/navigation";
import { usuarioActual } from "@/lib/auth/sesion";
import { esquemaComprar } from "@/lib/validaciones/tickets";
import { prepararComprobante } from "@/lib/archivos/comprobante";
import { ipCliente, limitar } from "@/lib/rateLimit";
import { comprarTicket } from "@/server/tickets";
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
    });
    codigo = ticket.codigo;
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "No se pudo completar la compra.",
    };
  }

  redirect(`/entradas/${codigo}`);
}
