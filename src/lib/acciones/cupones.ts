"use server";

import { revalidatePath } from "next/cache";
import { eventoPropioODeSuperadmin, verificarEventoEditable } from "@/lib/auth/guardas";
import { esquemaCambiarEstadoCupon, esquemaCrearCupon } from "@/lib/validaciones/cupones";
import * as servidorCupones from "@/server/cupones";
import { accionSegura } from "./marco";

export const crearCuponAction = accionSegura({
  esquema: esquemaCrearCupon,
  roles: ["organizador", "superadmin"],
  ejecutar: async (datos, usuario) => {
    // Si se especifica un evento, tiene que ser propio (o superadmin) y
    // editable — un cupón "todos mis eventos" (evento_id ausente) no está
    // atado a la aprobación de ningún evento puntual, así que no hay nada
    // que validar acá en ese caso.
    if (datos.evento_id !== undefined) {
      const evento = await eventoPropioODeSuperadmin(datos.evento_id, usuario);
      verificarEventoEditable(evento);
    }
    const id = await servidorCupones.crearCupon(usuario, {
      eventoId: datos.evento_id,
      codigo: datos.codigo,
      tipo: datos.tipo,
      valor: datos.valor,
      maxUsos: datos.max_usos,
      maxUsosPorComprador: datos.max_usos_por_comprador,
      montoMinimo: datos.monto_minimo,
      venceEn: datos.vence_en ?? undefined,
    });
    if (datos.evento_id !== undefined) {
      revalidatePath(`/panel/organizador/eventos/${datos.evento_id}/configuracion`);
    }
    return { id };
  },
});

export const cambiarEstadoCuponAction = accionSegura({
  esquema: esquemaCambiarEstadoCupon,
  roles: ["organizador", "superadmin"],
  ejecutar: async (datos, usuario) => {
    const cupon = await servidorCupones.obtenerCuponPropio(datos.id, usuario);
    if (cupon.eventoId !== null) {
      verificarEventoEditable(await eventoPropioODeSuperadmin(cupon.eventoId, usuario));
    }
    await servidorCupones.cambiarEstadoCupon(cupon, datos.activo);
    if (cupon.eventoId !== null) {
      revalidatePath(`/panel/organizador/eventos/${cupon.eventoId}/configuracion`);
    }
  },
});
