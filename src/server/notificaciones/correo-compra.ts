import nodemailer from "nodemailer";
import { linkWhatsapp } from "@/lib/formato";
import { origenSitio, urlCompra } from "@/lib/url-sitio";

/**
 * Correo al comprador cuando el superadmin aprueba o rechaza su compra. Se
 * manda con la misma cuenta del buzón de pagos que lee la conciliación (IMAP):
 * por defecto reutiliza IMAP_HOST/IMAP_USER/IMAP_PASS, y SMTP_* solo hace falta
 * si el servidor de salida es distinto.
 */

export type ResultadoCompra = "aprobada" | "rechazada";

export interface DatosCorreoCompra {
  codigo: string;
  nombreComprador: string;
  email: string;
  eventoNombre: string;
  resultado: ResultadoCompra;
  /** Número de WhatsApp de la plataforma, para que el comprador reclame si le rechazaron un pago real. */
  numeroWhatsapp: string | null;
}

export interface CorreoArmado {
  asunto: string;
  texto: string;
  html: string;
}

function escaparHtml(valor: string): string {
  return valor
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

// Colores de la marca (los mismos tokens de globals.css, tema oscuro). Un correo
// no puede leer variables CSS ni cargar la tipografía del sitio, así que van
// fijos e inline; la fuente cae a la del sistema si el cliente no tiene Inter.
const COLOR = {
  fondo: "#0d0f16",
  tarjeta: "#161a24",
  detalle: "#1b2029",
  borde: "#2a3140",
  texto: "#f6f4ef",
  apagado: "#9297a8",
  amarillo: "#fdb825",
  sobreAmarillo: "#0b0e17",
  lila: "#6641be",
  lilaClaro: "#a78bfa",
  verde: "#4ade80",
  verdeTenue: "#123321",
  rojo: "#f87171",
  rojoTenue: "#3a1616",
};
const FUENTE = "Inter,-apple-system,'Segoe UI',Roboto,Arial,sans-serif";

function boton(href: string, etiqueta: string, fondo: string, colorTexto: string): string {
  return `<a href="${escaparHtml(href)}" style="display:inline-block;background:${fondo};color:${colorTexto};font-family:${FUENTE};font-size:15px;font-weight:700;line-height:1;text-decoration:none;padding:15px 30px;border-radius:999px;">${escaparHtml(etiqueta)}</a>`;
}

function filaDetalle(etiqueta: string, valor: string, monoespaciado = false): string {
  const fuente = monoespaciado ? "'IBM Plex Mono',Consolas,Menlo,monospace" : FUENTE;
  return `<tr>
<td style="padding:6px 0;font-family:${FUENTE};font-size:11px;letter-spacing:1.2px;text-transform:uppercase;color:${COLOR.apagado};" width="90" valign="top">${escaparHtml(etiqueta)}</td>
<td style="padding:6px 0;font-family:${fuente};font-size:14px;font-weight:600;color:${COLOR.texto};" valign="top">${escaparHtml(valor)}</td>
</tr>`;
}

export function armarCorreoCompra(datos: DatosCorreoCompra): CorreoArmado {
  const { codigo, nombreComprador, eventoNombre, resultado, numeroWhatsapp } = datos;
  const url = urlCompra(codigo);
  const aprobada = resultado === "aprobada";

  const saludo = `Hola ${nombreComprador},`;
  const asunto = aprobada
    ? `Tu compra en Eike fue aprobada (${codigo})`
    : `No pudimos verificar el pago de tu compra en Eike (${codigo})`;
  const titulo = aprobada ? "¡Tu compra está lista!" : "No pudimos verificar tu pago";
  const insignia = aprobada ? "Compra aprobada" : "Pago no verificado";
  const parrafos = aprobada
    ? [`¡Tu compra ${codigo} para ${eventoNombre} fue aprobada! Ya podés ver tus entradas con su código QR:`]
    : [
        `No pudimos verificar el pago de tu compra ${codigo} para ${eventoNombre}, así que la rechazamos y liberamos tus entradas.`,
        numeroWhatsapp
          ? `Si ya pagaste, escribinos por WhatsApp al ${numeroWhatsapp} con tu comprobante y el código ${codigo}, y lo revisamos.`
          : `Si ya pagaste, respondé a este correo con tu comprobante y el código ${codigo}, y lo revisamos.`,
      ];
  const cierre = aprobada ? "Guardá este correo: con el link podés volver a tus entradas cuando quieras." : "";

  const texto = [saludo, ...parrafos, ...(aprobada ? [url] : []), ...(cierre ? [cierre] : []), "Equipo Eike"].join(
    "\n\n",
  );

  // Botón principal: ver las entradas (aprobada) o reclamar por WhatsApp (rechazada).
  let accion = "";
  if (aprobada) {
    accion = boton(url, "Ver mis entradas", COLOR.amarillo, COLOR.sobreAmarillo);
  } else if (numeroWhatsapp) {
    const mensaje = `Hola, mi compra ${codigo} en Eike fue rechazada pero ya pagué. Te mando mi comprobante.`;
    accion = boton(linkWhatsapp(numeroWhatsapp, mensaje), "Escribir por WhatsApp", COLOR.lila, "#ffffff");
  }

  const pTexto = `margin:0 0 16px;font-family:${FUENTE};font-size:15px;line-height:1.6;color:${COLOR.texto};`;
  const colorInsignia = aprobada ? COLOR.verde : COLOR.rojo;
  const fondoInsignia = aprobada ? COLOR.verdeTenue : COLOR.rojoTenue;

  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${escaparHtml(asunto)}</title>
</head>
<body style="margin:0;padding:0;background:${COLOR.fondo};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${COLOR.fondo};">${escaparHtml(parrafos[0])}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLOR.fondo}" style="background:${COLOR.fondo};">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;">
<tr><td align="center" style="padding:0 0 24px;">
<img src="${escaparHtml(origenSitio())}/logo-eike-email.png" width="120" alt="eike e-ticket" style="display:block;border:0;outline:none;height:auto;">
</td></tr>
<tr><td bgcolor="${COLOR.tarjeta}" style="background:${COLOR.tarjeta};border:1px solid ${COLOR.borde};border-radius:16px;padding:32px 28px;">
<span style="display:inline-block;background:${fondoInsignia};color:${colorInsignia};font-family:${FUENTE};font-size:11px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;padding:5px 12px;border-radius:999px;">${escaparHtml(insignia)}</span>
<h1 style="margin:16px 0 20px;font-family:${FUENTE};font-size:26px;line-height:1.2;font-weight:800;color:${COLOR.texto};">${escaparHtml(titulo)}</h1>
<p style="${pTexto}">${escaparHtml(saludo)}</p>
${parrafos.map((p) => `<p style="${pTexto}">${escaparHtml(p)}</p>`).join("\n")}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;">
<tr><td bgcolor="${COLOR.detalle}" style="background:${COLOR.detalle};border:1px solid ${COLOR.borde};border-radius:12px;padding:12px 18px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
${filaDetalle("Compra", codigo, true)}
${filaDetalle("Evento", eventoNombre)}
</table>
</td></tr>
</table>
${accion ? `<p style="margin:0 0 20px;" align="center">${accion}</p>` : ""}
${
  aprobada
    ? `<p style="margin:0 0 16px;font-family:${FUENTE};font-size:12px;line-height:1.6;color:${COLOR.apagado};">Si el botón no funciona, copiá este link en tu navegador:<br><a href="${escaparHtml(url)}" style="color:${COLOR.lilaClaro};word-break:break-all;">${escaparHtml(url)}</a></p>
<p style="margin:0;font-family:${FUENTE};font-size:13px;line-height:1.6;color:${COLOR.apagado};">${escaparHtml(cierre)}</p>`
    : ""
}
</td></tr>
<tr><td align="center" style="padding:24px 8px 0;font-family:${FUENTE};font-size:12px;line-height:1.6;color:${COLOR.apagado};">
Equipo Eike · Entradas para eventos en Paraguay<br>
Recibís este correo porque hiciste una compra en Eike.
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  return { asunto, texto, html };
}

export function configSmtp() {
  const host = process.env.SMTP_HOST || process.env.IMAP_HOST;
  const user = process.env.SMTP_USER || process.env.IMAP_USER;
  const pass = process.env.SMTP_PASS || process.env.IMAP_PASS;
  if (!host || !user || !pass) return null;
  const port = Number(process.env.SMTP_PORT) || 465;
  return {
    host,
    port,
    // 465 = TLS directo; 587 = STARTTLS (nodemailer lo negocia solo con secure=false).
    secure: port === 465,
    auth: { user, pass },
    from: process.env.SMTP_FROM || user,
  };
}

/**
 * Fuera de producción NO se envía salvo CORREO_ENVIO_DEV=true: la base de
 * desarrollo tiene compradores de prueba y el .env local suele traer las
 * credenciales reales del buzón, así que sin esta guarda un clic de prueba
 * mandaría correos de verdad.
 */
export function envioHabilitado(): boolean {
  return process.env.NODE_ENV === "production" || process.env.CORREO_ENVIO_DEV === "true";
}

/** Devuelve "enviado" u "omitido" (sin configuración o deshabilitado). Lanza si el servidor de correo falla. */
export async function enviarCorreoCompra(datos: DatosCorreoCompra): Promise<"enviado" | "omitido"> {
  if (!envioHabilitado()) {
    console.info(
      `Correo de compra ${datos.resultado} (${datos.codigo}) NO enviado: fuera de producción hace falta CORREO_ENVIO_DEV=true.`,
    );
    return "omitido";
  }
  const cfg = configSmtp();
  if (!cfg) {
    console.warn("Correo de compra omitido: falta configurar SMTP_* o IMAP_HOST/IMAP_USER/IMAP_PASS.");
    return "omitido";
  }

  const { asunto, texto, html } = armarCorreoCompra(datos);
  const transporte = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: cfg.auth,
    // Que un servidor de correo lento no deje colgada la aprobación en el panel.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
  await transporte.sendMail({
    from: { name: "Eike", address: cfg.from },
    to: datos.email,
    subject: asunto,
    text: texto,
    html,
  });
  return "enviado";
}
