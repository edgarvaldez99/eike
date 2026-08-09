"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eventoPropioODeSuperadmin } from "@/lib/auth/guardas";
import { interpretarFechaLocal } from "@/lib/fechas";
import { esquemaCrearEvento, esquemaEditarEvento, esquemaPublicarEvento } from "@/lib/validaciones/eventos";
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
    await servidorEventos.editarEvento(evento, {
      nombre: datos.nombre,
      descripcion: datos.descripcion,
      fechaEvento: interpretarFechaLocal(datos.fecha_evento),
      lugar: datos.lugar,
      aforoTotal: datos.aforo_total ?? null,
    });
    revalidatePath(`/panel/organizador/eventos/${datos.id}`);
    revalidatePath("/panel/organizador");
  },
});

export const publicarEventoAction = accionSegura({
  esquema: esquemaPublicarEvento,
  roles: ["organizador", "superadmin"],
  ejecutar: async (datos, usuario) => {
    const evento = await eventoPropioODeSuperadmin(datos.id, usuario);
    await servidorEventos.publicarEvento(evento);
    revalidatePath(`/panel/organizador/eventos/${datos.id}`);
    revalidatePath("/panel/organizador");
  },
});
