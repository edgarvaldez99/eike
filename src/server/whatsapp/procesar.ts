import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { and, eq, inArray, isNotNull, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/cliente";
import { comprobantesWhatsapp } from "@/db/esquema";
import type { EstadoComprobanteWa } from "@/lib/constantes";
import { directorioUploads, prepararComprobante } from "@/lib/archivos/comprobante";
import { cruzarComprobantesConAvisos } from "@/server/conciliacion/cruce";
import { ocrComprobante } from "@/server/conciliacion/ocr";
import { buscarOrdenPorMonto } from "@/server/conciliacion/ordenes-candidatas";
import { parsearComprobanteOcr } from "@/server/conciliacion/parser-comprobante";
import { descargarMedia } from "./api";

const mediaSchema = z.object({
  id: z.string(),
  mime_type: z.string().optional(),
  caption: z.string().optional(),
});

const payloadSchema = z.object({
  entry: z
    .array(
      z.object({
        changes: z
          .array(
            z.object({
              value: z.object({
                metadata: z.object({ phone_number_id: z.string().optional() }).optional(),
                contacts: z.array(z.object({ profile: z.object({ name: z.string().optional() }).optional() })).optional(),
                messages: z
                  .array(
                    z.object({
                      id: z.string(),
                      from: z.string(),
                      type: z.string(),
                      image: mediaSchema.optional(),
                      document: mediaSchema.optional(),
                    }),
                  )
                  .optional(),
              }),
            }),
          )
          .default([]),
      }),
    )
    .default([]),
});

export interface DepsWhatsapp {
  descargarMedia: typeof descargarMedia;
  ocr: typeof ocrComprobante;
}
const depsPorDefecto: DepsWhatsapp = { descargarMedia, ocr: ocrComprobante };

export interface ResumenWhatsapp {
  procesados: number;
  ignorados: number;
  repetidos: number;
  errores: number;
}

function directorioComprobantesWa(): string {
  return path.join(directorioUploads(), "comprobantes-wa");
}

/**
 * Procesa el payload de un webhook de WhatsApp: por cada imagen o PDF
 * recibido descarga el comprobante, le aplica OCR, hace el pre-check
 * (monto legible, Nº de comprobante no repetido, beneficiario esperado) y lo
 * guarda; después intenta el doble check contra los avisos del banco.
 * Todo lo demás (texto, audios, estados de entrega) se ignora. Idempotente
 * por wa_message_id: Meta reintenta los webhooks y no debe duplicar nada.
 */
export async function procesarPayload(payload: unknown, deps: DepsWhatsapp = depsPorDefecto): Promise<ResumenWhatsapp> {
  const resumen: ResumenWhatsapp = { procesados: 0, ignorados: 0, repetidos: 0, errores: 0 };
  const parsed = payloadSchema.safeParse(payload);
  if (!parsed.success) return resumen;

  const idNumeroEsperado = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const beneficiarioEsperado = (process.env.CONCILIACION_BENEFICIARIO ?? "").trim().toLowerCase();

  for (const entrada of parsed.data.entry) {
    for (const cambio of entrada.changes) {
      const { value } = cambio;
      // Eventos de otro número (otra app o cuenta) no son de esta plataforma.
      if (idNumeroEsperado && value.metadata?.phone_number_id && value.metadata.phone_number_id !== idNumeroEsperado) {
        resumen.ignorados += value.messages?.length ?? 0;
        continue;
      }
      const nombrePerfil = value.contacts?.[0]?.profile?.name ?? null;

      for (const mensaje of value.messages ?? []) {
        const media = mensaje.type === "image" ? mensaje.image : mensaje.type === "document" ? mensaje.document : undefined;
        if (!media) {
          resumen.ignorados += 1;
          continue;
        }
        try {
          const ya = await db
            .select({ id: comprobantesWhatsapp.id })
            .from(comprobantesWhatsapp)
            .where(eq(comprobantesWhatsapp.waMessageId, mensaje.id))
            .limit(1);
          if (ya.length > 0) {
            resumen.repetidos += 1;
            continue;
          }

          const descargado = await deps.descargarMedia(media.id);
          const preparado = await prepararComprobante(new File([new Uint8Array(descargado.buffer)], "comprobante"));
          const nombreArchivo = `${mensaje.from.replace(/\D/g, "")}_${media.id.replace(/\W/g, "")}.${preparado.extension}`;
          await mkdir(directorioComprobantesWa(), { recursive: true });
          await writeFile(path.join(directorioComprobantesWa(), nombreArchivo), preparado.buffer);

          let textoOcr: string | null = null;
          const problemas: string[] = [];
          try {
            textoOcr = await deps.ocr(preparado.buffer, descargado.mime, nombreArchivo);
          } catch (error) {
            problemas.push(`OCR falló: ${error instanceof Error ? error.message : "error desconocido"}`);
          }
          const datos = parsearComprobanteOcr(textoOcr ?? "");

          let estado: EstadoComprobanteWa = "pendiente_banco";
          if (datos.monto === null) {
            estado = "sin_datos";
            problemas.push("no se pudo leer el monto del comprobante");
          }
          if (datos.nro) {
            const repetido = await db
              .select({ id: comprobantesWhatsapp.id })
              .from(comprobantesWhatsapp)
              .where(
                and(eq(comprobantesWhatsapp.nroComprobante, datos.nro), ne(comprobantesWhatsapp.estado, "duplicado")),
              )
              .limit(1);
            if (repetido.length > 0) {
              estado = "duplicado";
              problemas.push(`comprobante ${datos.nro} ya recibido antes`);
            }
          }
          if (beneficiarioEsperado && !(datos.beneficiario ?? "").toLowerCase().includes(beneficiarioEsperado)) {
            if (estado === "pendiente_banco") estado = "observado";
            problemas.push(`el beneficiario no contiene "${beneficiarioEsperado}"`);
          }

          let ordenId: number | null = null;
          if (estado === "pendiente_banco" && datos.monto !== null) {
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
            const encontrada = await buscarOrdenPorMonto(db, datos.monto, [media.caption, datos.concepto], asignadas);
            if ("ordenId" in encontrada) ordenId = encontrada.ordenId;
          }

          await db
            .insert(comprobantesWhatsapp)
            .values({
              waMessageId: mensaje.id,
              waFrom: mensaje.from,
              nombrePerfil,
              caption: media.caption?.slice(0, 500) ?? null,
              archivo: nombreArchivo,
              textoOcr,
              banco: datos.banco,
              monto: datos.monto,
              nroComprobante: datos.nro,
              concepto: datos.concepto?.slice(0, 255) ?? null,
              pagador: datos.pagador?.slice(0, 255) ?? null,
              beneficiario: datos.beneficiario?.slice(0, 400) ?? null,
              estado,
              problemas: problemas.length > 0 ? problemas.join(" | ") : null,
              ordenId,
            })
            .onConflictDoNothing();
          resumen.procesados += 1;
        } catch (error) {
          resumen.errores += 1;
          console.error(`No se pudo procesar el mensaje ${mensaje.id}:`, error instanceof Error ? error.message : error);
        }
      }
    }
  }

  if (resumen.procesados > 0) await cruzarComprobantesConAvisos();
  return resumen;
}
