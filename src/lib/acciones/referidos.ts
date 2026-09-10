"use server";

import { revalidatePath } from "next/cache";
import { eventoPropioODeSuperadmin, verificarEventoEditable } from "@/lib/auth/guardas";
import { esquemaCambiarEstadoPrograma, esquemaCrearPrograma } from "@/lib/validaciones/referidos";
import * as servidorReferidos from "@/server/referidos";
import { accionSegura } from "./marco";

export const crearProgramaAction = accionSegura({
  esquema: esquemaCrearPrograma,
  roles: ["organizador", "superadmin"],
  ejecutar: async (datos, usuario) => {
    // Igual que en cupones: "todos mis eventos" (evento_id ausente) no está
    // atado a la aprobación de ningún evento puntual.
    if (datos.evento_id !== undefined) {
      const evento = await eventoPropioODeSuperadmin(datos.evento_id, usuario);
      verificarEventoEditable(evento);
    }
    const id = await servidorReferidos.crearPrograma(usuario, {
      eventoId: datos.evento_id,
      nombre: datos.nombre,
      ventasRequeridas: datos.ventas_requeridas,
      tandaPremioId: datos.tanda_premio_id,
      maxPremiosPorUsuario: datos.max_premios_por_usuario,
      montoMinimoVenta: datos.monto_minimo_venta,
    });
    if (datos.evento_id !== undefined) {
      revalidatePath(`/panel/organizador/eventos/${datos.evento_id}/configuracion`);
    }
    return { id };
  },
});

export const cambiarEstadoProgramaAction = accionSegura({
  esquema: esquemaCambiarEstadoPrograma,
  roles: ["organizador", "superadmin"],
  ejecutar: async (datos, usuario) => {
    const programa = await servidorReferidos.obtenerProgramaPropio(datos.id, usuario);
    if (programa.eventoId !== null) {
      verificarEventoEditable(await eventoPropioODeSuperadmin(programa.eventoId, usuario));
    }
    await servidorReferidos.cambiarEstadoPrograma(programa, datos.activo);
    if (programa.eventoId !== null) {
      revalidatePath(`/panel/organizador/eventos/${programa.eventoId}/configuracion`);
    }
  },
});
