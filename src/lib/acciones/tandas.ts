"use server";

import { revalidatePath } from "next/cache";
import { eventoPropioODeSuperadmin, tandaPropia } from "@/lib/auth/guardas";
import { ErrorNegocio } from "@/lib/errores";
import { esquemaCrearTanda, esquemaEditarTanda, esquemaEliminarTanda } from "@/lib/validaciones/tandas";
import * as servidorTandas from "@/server/tandas";
import { accionSegura } from "./marco";

/** El textarea de identificadores acepta comas y/o saltos de línea. */
function separarIdentificadores(texto: string | undefined): string[] {
  return (texto ?? "")
    .split(/[\n,]+/)
    .map((v) => v.trim())
    .filter(Boolean);
}

export const crearTandaAction = accionSegura({
  esquema: esquemaCrearTanda,
  roles: ["organizador", "superadmin"],
  ejecutar: async (datos, usuario) => {
    const evento = await eventoPropioODeSuperadmin(datos.evento_id, usuario);

    if (datos.tipo === "numerada" && !datos.modo_asientos) {
      throw new ErrorNegocio('Falta el modo de carga de asientos ("grilla" o "lista").');
    }

    const resultado = await servidorTandas.crearTanda(evento, {
      eventoId: datos.evento_id,
      nombre: datos.nombre,
      tipo: datos.tipo,
      precio: datos.precio,
      cantidadTotal: datos.cantidad_total,
      mapaAsientos:
        datos.tipo === "numerada"
          ? {
              modo: datos.modo_asientos!,
              filas: datos.filas,
              asientosPorFila: datos.asientos_por_fila,
              identificadores: separarIdentificadores(datos.identificadores),
            }
          : undefined,
    });

    revalidatePath(`/panel/organizador/eventos/${datos.evento_id}/configuracion`);
    return resultado;
  },
});

export const editarTandaAction = accionSegura({
  esquema: esquemaEditarTanda,
  roles: ["organizador", "superadmin"],
  ejecutar: async (datos, usuario) => {
    const tanda = await tandaPropia(datos.id, usuario);
    await servidorTandas.editarTanda(tanda, {
      nombre: datos.nombre,
      precio: datos.precio,
      cantidadTotal: datos.cantidad_total,
      estado: datos.estado,
    });
    revalidatePath(`/panel/organizador/eventos/${tanda.eventoId}/configuracion`);
  },
});

export const eliminarTandaAction = accionSegura({
  esquema: esquemaEliminarTanda,
  roles: ["organizador", "superadmin"],
  ejecutar: async (datos, usuario) => {
    const tanda = await tandaPropia(datos.id, usuario);
    await servidorTandas.eliminarTanda(tanda);
    revalidatePath(`/panel/organizador/eventos/${tanda.eventoId}/configuracion`);
  },
});
