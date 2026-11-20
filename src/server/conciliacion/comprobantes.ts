import { and, eq, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/db/cliente";
import { comprobantesWhatsapp } from "@/db/esquema";
import type { EstadoComprobanteWa, OrigenComprobante } from "@/lib/constantes";
import { buscarOrdenPorMonto } from "./ordenes-candidatas";
import type { ComprobanteParseado } from "./parser-comprobante";

export interface EntradaComprobante {
  /** Único por comprobante (el reintento de un webhook, o reprocesar una orden, no duplica). */
  waMessageId: string;
  waFrom: string;
  nombrePerfil: string | null;
  caption: string | null;
  archivo: string | null;
  textoOcr: string | null;
  /** Problemas ya detectados antes (ej. "OCR falló"); acá se suman los del pre-check. */
  problemas: string[];
  datos: ComprobanteParseado;
  origen: OrigenComprobante;
  /**
   * Orden a la que se SABE que pertenece el comprobante (el carrito: lo subió quien la compró).
   * null = hay que buscarla por monto (WhatsApp: llega suelto, sin saber de qué compra es).
   */
  orden: { id: number; total: number } | null;
}

/**
 * Pre-check y guardado de un comprobante ya leído por OCR (primer check de la
 * conciliación); el mismo para el que llega por WhatsApp y el que sube el
 * comprador en el checkout. Decide el estado (monto legible, Nº de comprobante
 * no repetido, beneficiario esperado y, si se sabe la orden, que el monto sea
 * el de la compra), lo guarda y marca como observados los anteriores que
 * comparten Nº sin confirmar. Después hay que cruzarlo con el aviso del banco
 * (cruce.ts::cruzarComprobantesConAvisos).
 */
export async function registrarComprobante(entrada: EntradaComprobante): Promise<void> {
  const { datos, orden } = entrada;
  const problemas = [...entrada.problemas];
  const beneficiarioEsperado = (process.env.CONCILIACION_BENEFICIARIO ?? "").trim().toLowerCase();

  let estado: EstadoComprobanteWa = "pendiente_banco";
  if (datos.monto === null) {
    estado = "sin_datos";
    problemas.push("no se pudo leer el monto del comprobante");
  }
  let previosSinConfirmar: number[] = [];
  if (datos.nro) {
    // Mismo banco Y mismo Nº: el número lo asigna cada banco, así que el mismo
    // número en bancos distintos no es una repetición.
    const previos = await db
      .select({ id: comprobantesWhatsapp.id, estado: comprobantesWhatsapp.estado })
      .from(comprobantesWhatsapp)
      .where(
        and(
          eq(comprobantesWhatsapp.nroComprobante, datos.nro),
          datos.banco ? eq(comprobantesWhatsapp.banco, datos.banco) : isNull(comprobantesWhatsapp.banco),
          ne(comprobantesWhatsapp.estado, "duplicado"),
        ),
      );
    const confirmado = previos.find((p) => p.estado === "confirmado");
    if (confirmado) {
      // Ya hay uno que el banco confirmó: este es una repetición.
      estado = "duplicado";
      problemas.push(`comprobante ${datos.nro} ya confirmado antes (#${confirmado.id})`);
    } else if (previos.length > 0) {
      // El anterior todavía no está confirmado, así que no se sabe cuál es el
      // real (alguien pudo mandar uno falso con un número ajeno): los dos
      // quedan observados para que los revise una persona, en vez de dar por
      // bueno al primero y descartar en silencio al segundo.
      estado = "observado";
      problemas.push(`el Nº ${datos.nro} ya lo usó el comprobante #${previos[0].id}, sin confirmar: revisar cuál es el real`);
      previosSinConfirmar = previos.filter((p) => p.estado === "pendiente_banco").map((p) => p.id);
    }
  }
  if (beneficiarioEsperado && !(datos.beneficiario ?? "").toLowerCase().includes(beneficiarioEsperado)) {
    if (estado === "pendiente_banco") estado = "observado";
    problemas.push(`el beneficiario no contiene "${beneficiarioEsperado}"`);
  }
  if (orden && datos.monto !== null && datos.monto !== orden.total) {
    // El comprador pagó de menos (o de más) respecto de lo que compró: que lo revise una persona.
    if (estado === "pendiente_banco") estado = "observado";
    problemas.push(`el monto del comprobante (${datos.monto}) no coincide con el total de la compra (${orden.total})`);
  }

  let ordenId: number | null = orden?.id ?? null;
  if (orden === null && estado === "pendiente_banco" && datos.monto !== null) {
    const asignadas = (
      await db
        .select({ id: comprobantesWhatsapp.ordenId })
        .from(comprobantesWhatsapp)
        .where(
          and(
            isNotNull(comprobantesWhatsapp.ordenId),
            inArray(comprobantesWhatsapp.estado, ["pendiente_banco", "confirmado"]),
          ),
        )
    )
      .map((f) => f.id)
      .filter((id): id is number => id !== null);
    const encontrada = await buscarOrdenPorMonto(db, datos.monto, [entrada.caption, datos.concepto], asignadas);
    if ("ordenId" in encontrada) ordenId = encontrada.ordenId;
  }

  await db
    .insert(comprobantesWhatsapp)
    .values({
      waMessageId: entrada.waMessageId,
      waFrom: entrada.waFrom,
      nombrePerfil: entrada.nombrePerfil,
      caption: entrada.caption?.slice(0, 500) ?? null,
      archivo: entrada.archivo,
      textoOcr: entrada.textoOcr,
      banco: datos.banco,
      monto: datos.monto,
      nroComprobante: datos.nro,
      concepto: datos.concepto?.slice(0, 255) ?? null,
      pagador: datos.pagador?.slice(0, 255) ?? null,
      beneficiario: datos.beneficiario?.slice(0, 400) ?? null,
      cuentaDestino: datos.cuentaDestino?.slice(0, 40) ?? null,
      fechaOperacion: datos.fecha,
      origen: entrada.origen,
      estado,
      problemas: problemas.length > 0 ? problemas.join(" | ") : null,
      ordenId,
    })
    .onConflictDoNothing();
  if (previosSinConfirmar.length > 0) {
    await db
      .update(comprobantesWhatsapp)
      .set({
        estado: "observado",
        problemas: sql`concat_ws(' | ', ${comprobantesWhatsapp.problemas}, ${`el Nº ${datos.nro} se repite en otro comprobante: revisar cuál es el real`}::text)`,
      })
      .where(inArray(comprobantesWhatsapp.id, previosSinConfirmar));
  }
}
