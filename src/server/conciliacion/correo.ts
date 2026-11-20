import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { registrarAviso } from "./avisos";
import { cruzarComprobantesConAvisos } from "./cruce";
import { obtenerCorreoReenvioBanco } from "@/server/cuenta";
import { dkimAutenticaRemitente } from "./dkim";
import { reenviarCorreoBanco } from "./reenvio";
import { cuentaDestinoAutorizada, htmlATexto, parsearAvisoBanco, remitenteAutorizado } from "./parser-banco";

const REMITENTES_POR_DEFECTO = "itau.com.py,familiar.com.py,ueno.com.py";

export interface ResumenLectura {
  revisados: number;
  conciliados: number;
  /** Comprobantes de WhatsApp que quedaron confirmados (doble check) en esta corrida. */
  confirmados: number;
  sinCruzar: number;
  ambiguos: number;
  descartados: number;
  duplicados: number;
  ignorados: number;
  errores: number;
}

function configImap() {
  const host = process.env.IMAP_HOST;
  const user = process.env.IMAP_USER;
  const pass = process.env.IMAP_PASS;
  if (!host || !user || !pass) {
    throw new Error("Falta configurar IMAP_HOST, IMAP_USER e IMAP_PASS.");
  }
  return { host, port: Number(process.env.IMAP_PORT) || 993, user, pass };
}

/**
 * Remitentes del banco aceptados. CONCILIACION_REMITENTES="*" acepta a
 * cualquiera, SOLO para probar con correos reenviados desde Gmail: en
 * producción se ignora (con aviso) y rige la lista por defecto — un From es
 * falsificable, y aceptar cualquiera dejaría que un correo trucado "confirme"
 * un pago que no existe.
 */
function remitentesPermitidos(): { lista: string[]; aceptarTodos: boolean } {
  const crudo = (process.env.CONCILIACION_REMITENTES ?? "").trim() || REMITENTES_POR_DEFECTO;
  if (crudo === "*") {
    if (process.env.NODE_ENV === "production") {
      console.warn('CONCILIACION_REMITENTES="*" se ignora en producción; se usa la lista por defecto del banco.');
      return { lista: REMITENTES_POR_DEFECTO.split(","), aceptarTodos: false };
    }
    return { lista: [], aceptarTodos: true };
  }
  return { lista: crudo.split(",").map((x) => x.trim()).filter(Boolean), aceptarTodos: false };
}

/** Cuentas propias (CONCILIACION_CUENTAS="123456,789012"): ver cuentaDestinoAutorizada. */
function cuentasPropias(): string[] {
  return (process.env.CONCILIACION_CUENTAS ?? "").split(",").map((x) => x.trim()).filter(Boolean);
}

/** Encabezados que agrega quien reenvía un correo SIN modificarlo (la firma DKIM sigue siendo válida). */
const ENCABEZADOS_DE_REENVIO = ["resent-from", "resent-to", "resent-date", "resent-message-id"];

/**
 * Lee del buzón de pagos los correos NO leídos, extrae los avisos de
 * transferencia del banco y los cruza con las órdenes pendientes. Marca como
 * leído solo lo que se procesó sin error (lo que falla se reintenta en la
 * próxima corrida). Se conecta con el certificado SSL validado — el host del
 * hosting es `hostingparaguay.cloud`, no `mail.<dominio>` (ver poc/README.md).
 *
 * Anti-falsificación (docs de ticketapi, "Anti-fraude"): solo se concilian
 * correos cuyo From REAL sea el del banco Y cuya firma DKIM se verifique acá,
 * criptográficamente (ver dkim.ts). En producción la firma es obligatoria y no
 * hay variable que la desactive; fuera de producción se exige solo con
 * CONCILIACION_EXIGIR_DKIM=true (los correos reenviados desde Gmail pierden la
 * firma del banco).
 *
 * Además se descarta el aviso si no es de nuestra cuenta (CONCILIACION_CUENTAS,
 * ver cuentaDestinoAutorizada) o si el correo fue reenviado sin modificar
 * (encabezados Resent-*): un aviso real de OTRA operación, reenviado tal cual,
 * conserva la firma del banco y de otro modo pasaría por válido.
 */
export async function leerCorreoBanco(): Promise<ResumenLectura> {
  const cfg = configImap();
  const { lista: permitidos, aceptarTodos } = remitentesPermitidos();
  const cuentas = cuentasPropias();
  const exigirDkim = process.env.NODE_ENV === "production" || process.env.CONCILIACION_EXIGIR_DKIM === "true";
  const resumen: ResumenLectura = {
    revisados: 0,
    conciliados: 0,
    confirmados: 0,
    sinCruzar: 0,
    ambiguos: 0,
    descartados: 0,
    duplicados: 0,
    ignorados: 0,
    errores: 0,
  };

  // Correo de la empresa al que se reenvía todo lo que mande el banco (ver reenvio.ts).
  const destinoReenvio = await obtenerCorreoReenvioBanco();

  const cliente = new ImapFlow({
    host: cfg.host,
    port: cfg.port,
    secure: true,
    auth: { user: cfg.user, pass: cfg.pass },
    logger: false,
  });
  await cliente.connect();
  const lock = await cliente.getMailboxLock("INBOX");
  try {
    const uids = (await cliente.search({ seen: false }, { uid: true })) || [];
    for (const uid of uids) {
      resumen.revisados += 1;
      try {
        const mensaje = await cliente.fetchOne(String(uid), { source: true }, { uid: true });
        if (!mensaje || !mensaje.source) throw new Error("Mensaje sin contenido.");
        const correo = await simpleParser(mensaje.source);

        const cuerpo = correo.text?.trim() ? correo.text : correo.html ? htmlATexto(correo.html) : "";
        const datos = parsearAvisoBanco(cuerpo);
        const remitente = correo.from?.value[0]?.address?.toLowerCase() ?? null;
        const autenticado = remitente !== null && datos !== null && (await dkimAutenticaRemitente(mensaje.source, remitente));

        if (datos === null) {
          resumen.ignorados += 1;
        } else {
          const reenviado = ENCABEZADOS_DE_REENVIO.some((h) => correo.headers.has(h));
          const sospechoso =
            !remitente ||
            !(aceptarTodos || remitenteAutorizado(remitente, permitidos)) ||
            (exigirDkim && !autenticado) ||
            !cuentaDestinoAutorizada(datos, cuentas) ||
            reenviado;
          const resultado = await registrarAviso({
            messageId: correo.messageId ?? `imap-${cfg.user}-${uid}`,
            remitente,
            autenticado,
            datos,
            sospechoso,
            cuerpo,
          });
          if (resultado === "duplicado") resumen.duplicados += 1;
          else if (resultado.estado === "conciliado") resumen.conciliados += 1;
          else if (resultado.estado === "ambiguo") resumen.ambiguos += 1;
          else if (resultado.estado === "descartado") resumen.descartados += 1;
          else resumen.sinCruzar += 1;
        }
        if (destinoReenvio && remitente && (aceptarTodos || remitenteAutorizado(remitente, permitidos))) {
          await reenviarCorreoBanco({
            destino: destinoReenvio,
            asunto: correo.subject ?? "(sin asunto)",
            remitenteOriginal: remitente,
            texto: cuerpo,
            html: typeof correo.html === "string" ? correo.html : null,
            original: mensaje.source,
            // El From es falsificable: sin firma DKIM válida se reenvía solo como texto, marcado.
            verificado: autenticado || (datos === null && (await dkimAutenticaRemitente(mensaje.source, remitente))),
          });
        }
        await cliente.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
      } catch (error) {
        resumen.errores += 1;
        console.error(`No se pudo procesar el correo UID ${uid}:`, error instanceof Error ? error.message : error);
      }
    }
  } finally {
    lock.release();
    await cliente.logout();
  }
  // Doble check: un aviso nuevo puede completar un comprobante de WhatsApp que
  // llegó antes. Se corre siempre, también si no hubo correos nuevos, para
  // retomar cruces que quedaron pendientes.
  resumen.confirmados = await cruzarComprobantesConAvisos();
  return resumen;
}
