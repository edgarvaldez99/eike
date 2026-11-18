import { and, eq, notInArray } from "drizzle-orm";
import type { db } from "@/db/cliente";
import { ordenes } from "@/db/esquema";

type Ejecutor = Pick<typeof db, "select">;

/**
 * Busca la orden pendiente a la que corresponde un pago por `monto`.
 * El monto es el matcher primario (viene en los 3 bancos y en el
 * comprobante); si varias órdenes comparten monto, el código de la orden en
 * el texto (concepto de la transferencia, mensaje del comprador) desempata.
 * `excluidas` son órdenes que ya tienen un pago asignado, para que dos pagos
 * iguales a dos órdenes iguales se repartan de a uno.
 *
 * Devuelve { orden } si hay exactamente una, o { ambiguas } con cuántas
 * coincidieron (0 = ninguna).
 */
export async function buscarOrdenPorMonto(
  tx: Ejecutor,
  monto: number,
  textos: Array<string | null | undefined>,
  excluidas: number[],
): Promise<{ ordenId: number } | { ambiguas: number }> {
  const candidatas = await tx
    .select({ id: ordenes.id, codigo: ordenes.codigo })
    .from(ordenes)
    .where(
      and(
        eq(ordenes.estado, "pendiente"),
        eq(ordenes.total, monto),
        excluidas.length > 0 ? notInArray(ordenes.id, excluidas) : undefined,
      ),
    );

  const texto = textos.filter(Boolean).join(" ").toLowerCase();
  const porCodigo = candidatas.filter((o) => texto.includes(o.codigo.toLowerCase()));
  const elegidas = porCodigo.length === 1 ? porCodigo : candidatas;
  return elegidas.length === 1 ? { ordenId: elegidas[0].id } : { ambiguas: elegidas.length };
}
