import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/cliente";
import { comprobantesWhatsapp, ordenes } from "@/db/esquema";
import { directorioUploads, prepararComprobante } from "@/lib/archivos/comprobante";
import { cruzarComprobantesConAvisos } from "@/server/conciliacion/cruce";
import { ocrComprobante } from "@/server/conciliacion/ocr";
import { registrarComprobante } from "@/server/conciliacion/comprobantes";
import { parsearComprobanteOcr } from "@/server/conciliacion/parser-comprobante";
import { descargarMedia } from "./api";
import { manejarTexto } from "./consulta";
import { actualizarEstadoSaliente, ordenDeLaConversacion, registrarMensaje } from "./mensajes";

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
                      text: z.object({ body: z.string() }).optional(),
                    }),
                  )
                  .optional(),
                statuses: z
                  .array(
                    z.object({
                      id: z.string(),
                      status: z.string(),
                      errors: z.array(z.object({ code: z.number().optional(), title: z.string().optional() })).optional(),
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
  /** Mensajes de texto atendidos (se respondió con el estado de la compra o una guía). */
  textos: number;
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
 * Los textos se contestan (consulta.ts) y los estados de entrega actualizan la
 * bitácora de mensajes enviados. Todo lo demás (audios, stickers…) solo se
 * registra. Idempotente por wa_message_id: Meta reintenta los webhooks y no
 * debe duplicar ni responder dos veces.
 */
export async function procesarPayload(payload: unknown, deps: DepsWhatsapp = depsPorDefecto): Promise<ResumenWhatsapp> {
  const resumen: ResumenWhatsapp = { procesados: 0, ignorados: 0, textos: 0, repetidos: 0, errores: 0 };
  const parsed = payloadSchema.safeParse(payload);
  if (!parsed.success) return resumen;

  const idNumeroEsperado = process.env.WHATSAPP_PHONE_NUMBER_ID;

  for (const entrada of parsed.data.entry) {
    for (const cambio of entrada.changes) {
      const { value } = cambio;
      // Eventos de otro número (otra app o cuenta) no son de esta plataforma.
      if (idNumeroEsperado && value.metadata?.phone_number_id && value.metadata.phone_number_id !== idNumeroEsperado) {
        resumen.ignorados += value.messages?.length ?? 0;
        continue;
      }
      for (const estado of value.statuses ?? []) {
        const detalle = estado.errors?.[0];
        try {
          if (estado.status === "failed") {
            await actualizarEstadoSaliente(estado.id, "fallido", detalle ? `${detalle.code ?? ""} ${detalle.title ?? ""}`.trim() : null);
          } else if (estado.status === "sent" || estado.status === "delivered" || estado.status === "read") {
            await actualizarEstadoSaliente(estado.id, estado.status === "sent" ? "enviado" : estado.status === "read" ? "leido" : "entregado");
          }
        } catch (error) {
          resumen.errores += 1;
          console.error(`No se pudo actualizar el estado ${estado.id}:`, error instanceof Error ? error.message : error);
        }
      }
      const nombrePerfil = value.contacts?.[0]?.profile?.name ?? null;

      for (const mensaje of value.messages ?? []) {
        if (mensaje.type === "text" && mensaje.text) {
          try {
            if (await manejarTexto({ waMessageId: mensaje.id, numero: mensaje.from, texto: mensaje.text.body })) resumen.textos += 1;
            else resumen.repetidos += 1;
          } catch (error) {
            resumen.errores += 1;
            console.error(`No se pudo atender el texto ${mensaje.id}:`, error instanceof Error ? error.message : error);
          }
          continue;
        }
        const media = mensaje.type === "image" ? mensaje.image : mensaje.type === "document" ? mensaje.document : undefined;
        if (!media) {
          // Audio, sticker, etc.: no se procesa, pero igual abre la ventana de 24 h.
          resumen.ignorados += 1;
          await registrarMensaje({
            direccion: "entrante",
            waMessageId: mensaje.id,
            numero: mensaje.from,
            ordenId: null,
            tipo: "otro",
            contenido: mensaje.type,
            estado: "recibido",
          }).catch(() => false);
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

          // Si antes se identificó con el código de su compra (desde su número), el
          // comprobante es de esa orden; si no, se busca por monto como siempre.
          const ordenConvId = await ordenDeLaConversacion(mensaje.from);
          const ordenConv = ordenConvId
            ? (await db.select({ id: ordenes.id, total: ordenes.total }).from(ordenes).where(eq(ordenes.id, ordenConvId)).limit(1))[0] ?? null
            : null;

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

          await registrarComprobante({
            waMessageId: mensaje.id,
            waFrom: mensaje.from,
            nombrePerfil,
            caption: media.caption ?? null,
            archivo: nombreArchivo,
            textoOcr,
            problemas,
            datos,
            origen: "whatsapp",
            orden: ordenConv,
          });
          await registrarMensaje({
            direccion: "entrante",
            waMessageId: mensaje.id,
            numero: mensaje.from,
            ordenId: ordenConv?.id ?? null,
            tipo: mensaje.type === "image" ? "imagen" : "documento",
            contenido: media.caption ?? null,
            estado: "recibido",
          });
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
