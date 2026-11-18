import { and, eq, isNotNull, ne, notInArray, sql } from "drizzle-orm";
import { db } from "@/db/cliente";
import { avisosBanco, comprobantesWhatsapp } from "@/db/esquema";
import { coincidenciasPago, estaCorroborado } from "./coincidencias";

// Clave fija del advisory lock: serializa el cruce entre el webhook de
// WhatsApp y el cron del correo, que pueden correr a la vez.
const LOCK_CRUCE = 727401;

/**
 * DOBLE CHECK: cruza los comprobantes de WhatsApp que pasaron el pre-check
 * ('pendiente_banco') con los avisos del banco por el MISMO MONTO y al menos
 * UN DATO MÁS que lo corrobore (el pagador o el Nº de comprobante, ver
 * coincidencias.ts): el monto solo no prueba que el aviso sea de ese pago.
 * Un comprobante sin corroboración queda 'pendiente_banco' para revisión
 * manual. Cada aviso confirma un solo comprobante. Se llama después de registrar cualquiera de
 * los dos lados, así el orden de llegada no importa (primero el comprobante o
 * primero el correo del banco).
 *
 * Los avisos 'descartado' (remitente no autorizado) nunca confirman nada.
 * Si el comprobante y el aviso apuntan a órdenes distintas, el comprobante
 * pasa a 'observado' en vez de confirmarse. NO aprueba la orden: la
 * aprobación sigue siendo una decisión humana.
 * Devuelve cuántos comprobantes quedaron confirmados.
 */
export async function cruzarComprobantesConAvisos(): Promise<number> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${LOCK_CRUCE})`);

    const pendientes = await tx
      .select()
      .from(comprobantesWhatsapp)
      .where(and(eq(comprobantesWhatsapp.estado, "pendiente_banco"), isNotNull(comprobantesWhatsapp.monto)))
      .orderBy(comprobantesWhatsapp.id);

    let confirmados = 0;
    for (const c of pendientes) {
      const usados = (
        await tx
          .select({ id: comprobantesWhatsapp.avisoId })
          .from(comprobantesWhatsapp)
          .where(isNotNull(comprobantesWhatsapp.avisoId))
      )
        .map((f) => f.id)
        .filter((id): id is number => id !== null);

      const avisosDelMonto = await tx
        .select()
        .from(avisosBanco)
        .where(
          and(
            eq(avisosBanco.monto, c.monto as number),
            ne(avisosBanco.estado, "descartado"),
            usados.length > 0 ? notInArray(avisosBanco.id, usados) : undefined,
          ),
        )
        .orderBy(avisosBanco.id);
      const aviso = avisosDelMonto.find((a) => estaCorroborado(coincidenciasPago(c, a)));
      if (!aviso) continue;

      if (c.ordenId !== null && aviso.ordenId !== null && c.ordenId !== aviso.ordenId) {
        await tx
          .update(comprobantesWhatsapp)
          .set({
            estado: "observado",
            problemas: [c.problemas, "el comprobante y el aviso del banco apuntan a órdenes distintas"]
              .filter(Boolean)
              .join(" | "),
          })
          .where(eq(comprobantesWhatsapp.id, c.id));
        continue;
      }

      await tx
        .update(comprobantesWhatsapp)
        .set({ estado: "confirmado", avisoId: aviso.id, ordenId: c.ordenId ?? aviso.ordenId })
        .where(eq(comprobantesWhatsapp.id, c.id));
      confirmados += 1;
    }
    return confirmados;
  });
}
