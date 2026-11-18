/**
 * Parser de los avisos de "transferencia recibida" que el banco manda por
 * correo. Portado de ticketapi/poc/leer_correo_banco.php (validado con
 * avisos reales de Itaú); formatos de ejemplo en ticketapi/docs/
 * 10-analisis-emails-bancos.md. Función pura: recibe el cuerpo ya en texto.
 */

export type BancoAviso = "Itaú" | "Familiar" | "UENO";

export interface AvisoParseado {
  banco: BancoAviso;
  /** Entero en guaraníes (sin separadores). */
  monto: number | null;
  pagador: string | null;
  /** Tal cual viene en el correo (DD/MM/AAAA HH:MM:SS). */
  fecha: string | null;
  /** Concepto/comentario que escribió el pagador, si el banco lo trae. */
  referencia: string | null;
  operacion: string | null;
}

// [ \t]* y no \s*: el valor está en la misma línea que la etiqueta, y un
// campo vacío (ej. "Comentario del cliente:" en Familiar) no debe tragarse
// la línea siguiente.
function capturar(regex: RegExp, texto: string): string | null {
  const m = regex.exec(texto);
  const valor = m?.[1]?.trim();
  return valor ? valor : null;
}

/** "PYG 724,000" / "3.614.000" / "520.000" → 724000 / 3614000 / 520000. */
export function normalizarMonto(texto: string | null): number | null {
  if (texto === null) return null;
  const digitos = texto.replace(/\D/g, "");
  return digitos === "" ? null : Number.parseInt(digitos, 10);
}

/** Convierte el HTML de un correo a texto conservando los saltos de línea
 * (UENO pone la etiqueta y el valor en líneas separadas). */
export function htmlATexto(html: string): string {
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>|<\/t[dh]>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

// Etiquetas conocidas de los avisos de Itaú y Familiar. Los correos reales
// llegan cortados a ~80 columnas y con varios campos corridos en un mismo
// párrafo ("Nro. de Operación: 123 Referencia: ABC Fecha ⏎ y hora…"), así que
// el valor de cada campo se corta en la PRÓXIMA etiqueta, no en el fin de línea.
const ETIQUETAS = [
  String.raw`Nro\. de operaci[oó]n`,
  "Referencia",
  String.raw`Fecha y hora de operaci[oó]n`,
  "Entidad pagadora",
  "Cliente pagador",
  String.raw`Nro\. de cuenta del pagador`,
  "Moneda y monto",
  "Entidad beneficiaria",
  "Cliente beneficiario",
  String.raw`Nro\. de cuenta del beneficiario`,
  String.raw`Nro\. de cuenta cr[eé]dito`,
  String.raw`Nro\. comprobante`,
  "Concepto de la transferencia",
  String.raw`Raz[oó]n de comunicaci[oó]n`,
  "Comentario del cliente",
  "Estado",
].join("|");
const FIN_DE_VALOR = String.raw`(?=\s+(?:${ETIQUETAS}):|\s+Te recordamos|$)`;

/** Valor de un campo "Etiqueta: valor" en el texto ya sin saltos de línea. */
function valorDe(plano: string, etiqueta: string): string | null {
  const m = new RegExp(String.raw`${etiqueta}:(?!\s*Te recordamos)\s*(.+?)${FIN_DE_VALOR}`, "i").exec(plano);
  return m?.[1]?.trim() || null;
}

/** Devuelve null si el texto no parece un aviso de transferencia conocido. */
export function parsearAvisoBanco(texto: string): AvisoParseado | null {
  const t = texto;
  const plano = texto.replace(/\s+/g, " ");
  // Itaú y Familiar se chequean antes que UENO: un aviso de Familiar de una
  // transferencia hecha desde UENO nombra "UENO BANK" como entidad pagadora.
  const esItau =
    /Concepto de la Transferencia/i.test(t) || (/Nro\. comprobante/i.test(t) && /cuenta cr[eé]dito/i.test(t));
  const esFamiliar = /BANCO FAMILIAR/i.test(t) || /Comentario del cliente/i.test(t);
  const esUeno = /ueno bank/i.test(t) || /Recibiste una transferencia/i.test(t);

  if (esItau || esFamiliar) {
    const fechaOperacion = /Fecha y hora de operaci[oó]n:\s*(\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}(?::\d{2})?)/i.exec(plano);
    return {
      banco: esItau ? "Itaú" : "Familiar",
      monto: normalizarMonto(valorDe(plano, "Moneda y monto")?.replace(/^(?:PYG|Gs\.?)\s*/i, "") ?? null),
      pagador: valorDe(plano, "Cliente pagador"),
      fecha: fechaOperacion?.[1] ?? null,
      // Itaú propaga el concepto que escribe el pagador; Familiar, el "comentario del cliente".
      referencia: esItau ? valorDe(plano, "Concepto de la transferencia") : valorDe(plano, "Comentario del cliente"),
      operacion:
        valorDe(plano, String.raw`Nro\. de operaci[oó]n`)?.split(" ")[0] ??
        valorDe(plano, String.raw`Nro\. comprobante`)?.split(" ")[0] ??
        null,
    };
  }
  if (esUeno) {
    // UENO: etiqueta y valor en líneas separadas, y no trae pagador,
    // operación ni concepto — el cruce depende solo del monto.
    return {
      banco: "UENO",
      monto: normalizarMonto(capturar(/Monto\s+(?:PYG|Gs\.?)\s*([\d.,]+)/i, t)),
      pagador: null,
      fecha: capturar(/Fecha y hora transferencia\s+([\d/]{8,10}\s+[\d:]{5,8})/i, t),
      referencia: null,
      operacion: null,
    };
  }
  return null;
}

/**
 * ¿El From real del correo es del banco? Se compara la dirección dentro de
 * <...>, no el nombre visible (un From "info@itau.com.py" <x@evil.com> se
 * evalúa como x@evil.com). Cada patrón es un dominio (cubre subdominios) o
 * una dirección exacta. Lista vacía = no autoriza a nadie (falla cerrado).
 */
export function remitenteAutorizado(direccion: string, permitidos: string[]): boolean {
  if (permitidos.length === 0) return false;
  const addr = direccion.trim().toLowerCase();
  return permitidos.some((patron) => {
    const p = patron.trim().toLowerCase();
    if (p === "") return false;
    if (p.includes("@")) return addr === p || (p.startsWith("@") && addr.endsWith(p));
    return addr.endsWith(`@${p}`) || addr.endsWith(`.${p}`);
  });
}
