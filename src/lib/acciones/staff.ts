"use server";

import { revalidatePath } from "next/cache";
import { eventoPropioODeSuperadmin, staffPropio } from "@/lib/auth/guardas";
import {
  esquemaAsignarStaff,
  esquemaInvitarStaff,
  esquemaQuitarStaffDeEvento,
  esquemaStaffId,
} from "@/lib/validaciones/staff";
import * as servidorStaff from "@/server/staff";
import { accionSegura } from "./marco";

export const invitarStaffAction = accionSegura({
  esquema: esquemaInvitarStaff,
  roles: ["organizador", "superadmin"],
  ejecutar: async (datos, usuario) => {
    await eventoPropioODeSuperadmin(datos.evento_id, usuario);
    const token = await servidorStaff.invitarStaff(usuario, datos.evento_id);
    revalidatePath(`/panel/organizador/eventos/${datos.evento_id}/staff`);
    return { token };
  },
});

export const asignarStaffAction = accionSegura({
  esquema: esquemaAsignarStaff,
  roles: ["organizador", "superadmin"],
  ejecutar: async (datos, usuario) => {
    await staffPropio(datos.staff_id, usuario);
    await eventoPropioODeSuperadmin(datos.evento_id, usuario);
    await servidorStaff.asignarStaff(datos.staff_id, datos.evento_id);
    revalidatePath(`/panel/organizador/eventos/${datos.evento_id}/staff`);
  },
});

export const quitarStaffDeEventoAction = accionSegura({
  esquema: esquemaQuitarStaffDeEvento,
  roles: ["organizador", "superadmin"],
  ejecutar: async (datos, usuario) => {
    await staffPropio(datos.staff_id, usuario);
    await eventoPropioODeSuperadmin(datos.evento_id, usuario);
    await servidorStaff.quitarStaffDeEvento(datos.staff_id, datos.evento_id);
    revalidatePath(`/panel/organizador/eventos/${datos.evento_id}/staff`);
  },
});

export const inactivarStaffAction = accionSegura({
  esquema: esquemaStaffId,
  roles: ["organizador", "superadmin"],
  ejecutar: async (datos, usuario) => {
    await staffPropio(datos.staff_id, usuario);
    await servidorStaff.inactivarStaff(datos.staff_id);
    revalidatePath("/panel/organizador", "layout");
  },
});

export const reactivarStaffAction = accionSegura({
  esquema: esquemaStaffId,
  roles: ["organizador", "superadmin"],
  ejecutar: async (datos, usuario) => {
    await staffPropio(datos.staff_id, usuario);
    await servidorStaff.reactivarStaff(datos.staff_id);
    revalidatePath("/panel/organizador", "layout");
  },
});
