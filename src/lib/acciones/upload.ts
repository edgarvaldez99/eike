"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { eventoPropioODeSuperadmin } from "@/lib/auth/guardas";
import { guardarAfiche } from "@/lib/archivos/subirAfiche";
import { db } from "@/db/cliente";
import { eventos } from "@/db/esquema";
import { eq } from "drizzle-orm";
import { zIdPositivo } from "@/lib/validaciones/comun";
import { accionSegura } from "./marco";

const esquemaSubirAfiche = z.object({
  evento_id: zIdPositivo,
  afiche: z.instanceof(File, { message: "Falta el archivo." }),
});

/**
 * Puerto de api/upload.php?accion=afiche. El PHP viejo solo permitía
 * `requerirSesion(['organizador'])` — un bug real que dejaba al superadmin
 * sin poder subir afiches a nombre de un organizador. Acá se corrige.
 */
export const subirAficheAction = accionSegura({
  esquema: esquemaSubirAfiche,
  roles: ["organizador", "superadmin"],
  ejecutar: async (datos, usuario) => {
    const evento = await eventoPropioODeSuperadmin(datos.evento_id, usuario);
    const aficheUrl = await guardarAfiche(datos.afiche, evento.organizadorId);
    await db.update(eventos).set({ aficheUrl }).where(eq(eventos.id, datos.evento_id));
    revalidatePath(`/panel/organizador/eventos/${datos.evento_id}/configuracion`);
    return { aficheUrl };
  },
});
