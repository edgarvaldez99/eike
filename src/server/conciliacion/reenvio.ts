import nodemailer from "nodemailer";
import { configSmtp, envioHabilitado } from "@/server/notificaciones/correo-compra";

export interface CorreoParaReenviar {
  destino: string;
  asunto: string;
  remitenteOriginal: string;
  texto: string;
  html: string | null;
  /** Mensaje original completo (.eml), adjunto para conservar encabezados y firma del banco. */
  original: Buffer;
  /** ¿La firma DKIM del banco se verificó? Si no, se reenvía solo texto y marcado como no verificado. */
  verificado: boolean;
}

/**
 * Reenvía a la empresa un correo del banco que llegó al buzón de pagos. Ese
 * buzón solo es un "pasamanos" para la conciliación; el banco es de la empresa
 * y tiene que seguir recibiendo sus avisos. Va como correo nuevo (el servidor
 * SMTP no deja salir mensajes con un From ajeno) con el original adjunto.
 * Un correo sin firma DKIM válida podría ser un From falsificado: no se reenvía su
 * HTML (evita que la empresa reciba phishing con apariencia de aviso del banco),
 * solo el texto, con el asunto marcado y sin adjuntos. Devuelve "omitido" si no se puede enviar (fuera de producción o sin SMTP);
 * lanza si el servidor de correo falla, para que la corrida lo reintente.
 */
export async function reenviarCorreoBanco(correo: CorreoParaReenviar): Promise<"enviado" | "omitido"> {
  if (!envioHabilitado()) return "omitido";
  const cfg = configSmtp();
  if (!cfg) {
    console.warn("Reenvío del correo del banco omitido: falta configurar SMTP_* o IMAP_HOST/IMAP_USER/IMAP_PASS.");
    return "omitido";
  }
  const transporte = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: cfg.auth,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
  const aviso = correo.verificado
    ? `Correo del banco (de ${correo.remitenteOriginal}) reenviado automáticamente por Eike.`
    : `ATENCIÓN: no se pudo verificar la firma del banco (puede ser falso). Remitente declarado: ${correo.remitenteOriginal}. No abras links ni adjuntos.`;
  await transporte.sendMail({
    from: { name: "Eike (aviso del banco)", address: cfg.from },
    to: correo.destino,
    subject: `${correo.verificado ? "" : "[NO VERIFICADO] "}Fwd: ${correo.asunto}`,
    text: `${aviso}\n\n${correo.texto}`,
    html: correo.verificado ? (correo.html ?? undefined) : undefined,
    // Sin firma verificada tampoco se adjunta el original: abrir un .eml mostraría su HTML falsificado.
    attachments: correo.verificado
      ? [{ filename: "aviso-banco.eml", content: correo.original, contentType: "message/rfc822" }]
      : [],
  });
  return "enviado";
}
