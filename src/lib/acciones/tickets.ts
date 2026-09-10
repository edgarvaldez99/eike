"use server";

import { revalidatePath } from "next/cache";
import { esquemaAprobarRechazarOrden, esquemaCrearCortesia } from "@/lib/validaciones/tickets";
import * as servidorTickets from "@/server/tickets";
import { accionSegura } from "./marco";

export const aprobarOrdenAction = accionSegura({
  esquema: esquemaAprobarRechazarOrden,
  roles: ["organizador", "superadmin"],
  ejecutar: async (datos, usuario) => {
    const orden = await servidorTickets.obtenerOrdenPendientePropia(datos.id, usuario);
    const eventosIds = await servidorTickets.aprobarOrden(orden, usuario);
    for (const eventoId of eventosIds) revalidatePath(`/panel/organizador/eventos/${eventoId}`);
  },
});

export const rechazarOrdenAction = accionSegura({
  esquema: esquemaAprobarRechazarOrden,
  roles: ["organizador", "superadmin"],
  ejecutar: async (datos, usuario) => {
    const orden = await servidorTickets.obtenerOrdenPendientePropia(datos.id, usuario);
    const eventosIds = await servidorTickets.rechazarOrden(orden);
    for (const eventoId of eventosIds) revalidatePath(`/panel/organizador/eventos/${eventoId}`);
  },
});

export const crearCortesiaAction = accionSegura({
  esquema: esquemaCrearCortesia,
  roles: ["organizador", "superadmin"],
  ejecutar: async (datos, usuario) => {
    const resultado = await servidorTickets.crearCortesia(usuario, {
      tandaId: datos.tanda_id,
      nombreComprador: datos.nombre_comprador,
      email: datos.email,
      cedula: datos.cedula,
      contacto: datos.contacto,
    });
    revalidatePath(`/panel/organizador/eventos/${resultado.eventoId}`);
    return resultado;
  },
});
