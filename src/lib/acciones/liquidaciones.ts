"use server";

import { revalidatePath } from "next/cache";
import { esquemaCrearLiquidacion } from "@/lib/validaciones/liquidaciones";
import { crearLiquidacion } from "@/server/liquidaciones";
import { accionSegura } from "./marco";

export const crearLiquidacionAction = accionSegura({
  esquema: esquemaCrearLiquidacion,
  roles: ["superadmin"],
  ejecutar: async (datos) => {
    await crearLiquidacion({
      organizadorId: datos.organizador_id,
      periodoInicio: datos.periodo_inicio,
      periodoFin: datos.periodo_fin,
      totalVendido: datos.total_vendido,
      montoComisionOSuscripcion: datos.monto_comision_o_suscripcion,
    });
    revalidatePath("/panel/admin/liquidaciones");
  },
});
