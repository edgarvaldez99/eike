"use server";

import { revalidatePath } from "next/cache";
import {
  esquemaEditarOrganizador,
  esquemaOrganizadorId,
  esquemaRechazarOrganizador,
} from "@/lib/validaciones/usuarios";
import * as servidorUsuarios from "@/server/usuarios";
import { accionSegura } from "./marco";

export const aprobarOrganizadorAction = accionSegura({
  esquema: esquemaOrganizadorId,
  roles: ["superadmin"],
  ejecutar: async (datos) => {
    await servidorUsuarios.aprobarOrganizador(datos.id);
    revalidatePath("/panel/admin");
  },
});

export const rechazarOrganizadorAction = accionSegura({
  esquema: esquemaRechazarOrganizador,
  roles: ["superadmin"],
  ejecutar: async (datos) => {
    await servidorUsuarios.rechazarOrganizador(datos.id, datos.motivo);
    revalidatePath("/panel/admin");
  },
});

export const editarOrganizadorAction = accionSegura({
  esquema: esquemaEditarOrganizador,
  roles: ["superadmin"],
  ejecutar: async (datos) => {
    await servidorUsuarios.editarOrganizador(datos.id, {
      nombre: datos.nombre,
      telefono: datos.telefono,
      rucFacturacion: datos.ruc_facturacion,
    });
    revalidatePath("/panel/admin");
  },
});

export const inactivarOrganizadorAction = accionSegura({
  esquema: esquemaOrganizadorId,
  roles: ["superadmin"],
  ejecutar: async (datos) => {
    await servidorUsuarios.inactivarOrganizador(datos.id);
    revalidatePath("/panel/admin");
  },
});

export const reactivarOrganizadorAction = accionSegura({
  esquema: esquemaOrganizadorId,
  roles: ["superadmin"],
  ejecutar: async (datos) => {
    await servidorUsuarios.reactivarOrganizador(datos.id);
    revalidatePath("/panel/admin");
  },
});
