"use server";

import { revalidatePath } from "next/cache";
import {
  esquemaAsignarComprobante,
  esquemaResolverDerivacion,
  esquemaResponderDerivacion,
} from "@/lib/validaciones/whatsapp";
import { asignarComprobanteAOrden, resolverDerivacion, responderDerivacion } from "@/server/whatsapp/atencion";
import { accionSegura } from "./marco";

const RUTA = "/panel/admin/aprobaciones/whatsapp";

export const resolverDerivacionAction = accionSegura({
  esquema: esquemaResolverDerivacion,
  roles: ["superadmin"],
  ejecutar: async (datos) => {
    await resolverDerivacion(datos.id);
    revalidatePath(RUTA, "layout");
  },
});

export const responderDerivacionAction = accionSegura({
  esquema: esquemaResponderDerivacion,
  roles: ["superadmin"],
  ejecutar: async (datos) => {
    await responderDerivacion(datos.id, datos.texto);
    revalidatePath(RUTA);
  },
});

export const asignarComprobanteAction = accionSegura({
  esquema: esquemaAsignarComprobante,
  roles: ["superadmin"],
  ejecutar: async (datos) => {
    await asignarComprobanteAOrden(datos.id, datos.codigo);
    revalidatePath(RUTA);
    revalidatePath("/panel/admin/aprobaciones/compras");
  },
});
