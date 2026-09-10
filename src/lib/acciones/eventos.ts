"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eventoPropioODeSuperadmin, verificarEventoEditable } from "@/lib/auth/guardas";
import { interpretarFechaLocal } from "@/lib/fechas";
import {
  esquemaAprobarEvento,
  esquemaCrearEvento,
  esquemaEditarEvento,
  esquemaRechazarEvento,
  esquemaSolicitarAprobacionEvento,
} from "@/lib/validaciones/eventos";
import * as servidorEventos from "@/server/eventos";
import { accionSegura } from "./marco";

export const crearEventoAction = accionSegura({
  esquema: esquemaCrearEvento,
  roles: ["organizador", "superadmin"],
  ejecutar: async (datos, usuario) => {
    const id = await servidorEventos.crearEvento(usuario, {
      nombre: datos.nombre,
      descripcion: datos.descripcion,
      fechaEvento: interpretarFechaLocal(datos.fecha_evento),
      lugar: datos.lugar,
      aforoTotal: datos.aforo_total ?? null,
      esGratuito: datos.es_gratuito,
    });
    revalidatePath("/panel/organizador");
    redirect(`/panel/organizador/eventos/${id}/configuracion`);
  },
});

export const editarEventoAction = accionSegura({
  esquema: esquemaEditarEvento,
  roles: ["organizador", "superadmin"],
  ejecutar: async (datos, usuario) => {
    const evento = await eventoPropioODeSuperadmin(datos.id, usuario);
    verificarEventoEditable(evento);
    await servidorEventos.editarEvento(evento, {
      nombre: datos.nombre,
      descripcion: datos.descripcion,
      fechaEvento: interpretarFechaLocal(datos.fecha_evento),
      lugar: datos.lugar,
      aforoTotal: datos.aforo_total ?? null,
    });
    revalidatePath(`/panel/organizador/eventos/${datos.id}`);
    revalidatePath("/panel/organizador");
    // El nombre (y por lo tanto el slug, que se calcula del nombre — no hay
    // columna slug en la base) pudo haber cambiado: revalidar el storefront
    // igual que en solicitarAprobacionEventoAction, si no la edición de un
    // evento ya publicado no se ve hasta que venza el ISR (revalidate=300 en
    // /eventos, revalidate=60 en la ficha).
    revalidatePath("/eventos");
    revalidatePath("/eventos/[slugId]", "page");
  },
});

/**
 * Antes "publicar" directo — pedido anti-estafa: el organizador ya no
 * publica solo, solicita aprobación. De acá sale 'pendiente_aprobacion',
 * que deja el evento de solo lectura (ver verificarEventoEditable) hasta
 * que el superadmin lo apruebe o lo rechace (ver las dos acciones de abajo).
 */
export const solicitarAprobacionEventoAction = accionSegura({
  esquema: esquemaSolicitarAprobacionEvento,
  roles: ["organizador", "superadmin"],
  ejecutar: async (datos, usuario) => {
    const evento = await eventoPropioODeSuperadmin(datos.id, usuario);
    await servidorEventos.solicitarAprobacionEvento(evento);
    revalidatePath(`/panel/organizador/eventos/${datos.id}`);
    revalidatePath("/panel/organizador");
    revalidatePath("/panel/admin/eventos");
  },
});

export const aprobarEventoAction = accionSegura({
  esquema: esquemaAprobarEvento,
  roles: ["superadmin"],
  ejecutar: async (datos, usuario) => {
    const evento = await eventoPropioODeSuperadmin(datos.id, usuario);
    await servidorEventos.aprobarEvento(evento);
    revalidatePath(`/panel/organizador/eventos/${datos.id}`);
    revalidatePath("/panel/organizador");
    revalidatePath("/panel/admin/eventos");
    // Recién ahora el evento existe para el comprador — mismo bug de ISR
    // que ya se arregló acá antes (cuando esto era publicarEventoAction):
    // sin esto no aparece en el storefront hasta que venza el ISR.
    revalidatePath("/eventos");
    revalidatePath("/eventos/[slugId]", "page");
  },
});

export const rechazarEventoAction = accionSegura({
  esquema: esquemaRechazarEvento,
  roles: ["superadmin"],
  ejecutar: async (datos, usuario) => {
    const evento = await eventoPropioODeSuperadmin(datos.id, usuario);
    await servidorEventos.rechazarEvento(evento, datos.motivo);
    revalidatePath(`/panel/organizador/eventos/${datos.id}`);
    revalidatePath("/panel/organizador");
    revalidatePath("/panel/admin/eventos");
  },
});
