"use server";

import { revalidatePath } from "next/cache";
import { esquemaAprobarRechazarTicket, esquemaCrearCortesia } from "@/lib/validaciones/tickets";
import * as servidorTickets from "@/server/tickets";
import { accionSegura } from "./marco";

export const aprobarTicketAction = accionSegura({
  esquema: esquemaAprobarRechazarTicket,
  roles: ["organizador", "superadmin"],
  ejecutar: async (datos, usuario) => {
    const ticket = await servidorTickets.obtenerTicketPendientePropio(datos.id, usuario);
    await servidorTickets.aprobarTicket(ticket, usuario);
    revalidatePath(`/panel/organizador/eventos/${ticket.eventoId}`);
  },
});

export const rechazarTicketAction = accionSegura({
  esquema: esquemaAprobarRechazarTicket,
  roles: ["organizador", "superadmin"],
  ejecutar: async (datos, usuario) => {
    const ticket = await servidorTickets.obtenerTicketPendientePropio(datos.id, usuario);
    await servidorTickets.rechazarTicket(ticket);
    revalidatePath(`/panel/organizador/eventos/${ticket.eventoId}`);
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
