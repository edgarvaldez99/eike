import { normalizarMonto } from "./parser-banco";

/**
 * Datos extraídos por OCR del comprobante de transferencia que el comprador
 * manda por WhatsApp (captura de la app de su banco). Portado de
 * ticketapi/poc/webhook.php::parsearComprobanteOcr y ajustado con
 * comprobantes reales (ueno e Itaú). Es el primer check: NO prueba que la
 * plata llegó (los comprobantes se falsifican), por eso se cruza con el aviso
 * del banco.
 */
export interface ComprobanteParseado {
  banco: string | null;
  monto: number | null;
  concepto: string | null;
  nro: string | null;
  pagador: string | null;
  beneficiario: string | null;
  /** Cuenta que recibió la plata, si la captura la muestra ("Cta. N° 81123742"). */
  cuentaDestino: string | null;
  /** Fecha y hora de la transferencia como "DD/MM/AAAA HH:MM" (el mismo formato de fecha_operacion de los avisos). */
  fecha: string | null;
}

function capturar(regex: RegExp, texto: string): string | null {
  const valor = regex.exec(texto)?.[1]?.trim();
  return valor ? valor.replace(/\s+/g, " ") : null;
}

// El OCR confunde acentos ("itaü" en vez de "itaú"), así que cada banco se
// reconoce con una variante tolerante.
const BANCOS: Array<[string, RegExp]> = [
  ["ueno", /ueno/i],
  ["Itaú", /ita[uúü]/i],
  ["Familiar", /familiar/i],
  ["Continental", /continental/i],
  ["Sudameris", /sudameris/i],
];

/** Banco EMISOR: el primero en aparecer. En la captura de la app el nombre de
 * quien envía va arriba; el banco del beneficiario aparece más abajo, en el
 * bloque "para". */
function detectarBanco(texto: string): string | null {
  let mejor: { nombre: string; posicion: number } | null = null;
  for (const [nombre, regex] of BANCOS) {
    const posicion = texto.search(regex);
    if (posicion >= 0 && (mejor === null || posicion < mejor.posicion)) mejor = { nombre, posicion };
  }
  return mejor?.nombre ?? null;
}

// Etiqueta con el valor en la misma línea o en la línea siguiente
// ("número de comprobante" ⏎ "2593738", como en la app de Itaú).
const NRO_COMPROBANTE =
  /(?:N(?:ro\.?|[uúü]mero)[ \t]*de[ \t]*)?comprobante[ \t]*:?[ \t]*\n?[ \t]*#?[ \t]*([A-Z0-9]{6,})/i;
const NRO_OPERACION =
  /(?:N(?:ro\.?|[uúü]mero)[ \t]*de[ \t]*)?operaci[oó]n[ \t]*:?[ \t]*\n?[ \t]*#?[ \t]*([A-Z0-9]{6,})/i;

const MESES: Record<string, string> = {
  ene: "01", feb: "02", mar: "03", abr: "04", may: "05", jun: "06",
  jul: "07", ago: "08", sep: "09", set: "09", oct: "10", nov: "11", dic: "12",
};

/**
 * Fecha y hora de la captura: "16 nov 2026 a las 20:30 hs", "19 nov 2026 - 22:54 Hs"
 * o "16/11/2026 20:30". Devuelve "DD/MM/AAAA HH:MM", o null si no hay una fecha con hora.
 */
export function extraerFechaComprobante(texto: string): string | null {
  const candidatos = [
    /(\d{1,2})[ \t]+(ene|feb|mar|abr|may|jun|jul|ago|sep|set|oct|nov|dic)[a-z]*\.?[ \t]+(\d{4})/i,
    /(\d{1,2})\/(\d{1,2})\/(\d{4})/,
  ];
  for (const regex of candidatos) {
    const m = regex.exec(texto);
    if (!m) continue;
    const hora = /(\d{1,2}):(\d{2})/.exec(texto.slice(m.index + m[0].length, m.index + m[0].length + 40));
    if (!hora) continue;
    const mes = MESES[m[2].toLowerCase().slice(0, 3)] ?? m[2].padStart(2, "0");
    return `${m[1].padStart(2, "0")}/${mes}/${m[3]} ${hora[1].padStart(2, "0")}:${hora[2]}`;
  }
  return null;
}

/**
 * Cuenta que recibió la plata: el Nº de cuenta (5+ dígitos, las de origen suelen venir
 * enmascaradas) que aparece después del bloque "PARA", o el primero del texto si no hay bloque.
 */
export function extraerCuentaDestino(texto: string): string | null {
  const desde = Math.max(0, texto.search(/(?:^|\n)[ \t]*PARA\b/i));
  // "cuenta en guaraníes nº 81123742" (puede venir en varias líneas) o "Cta. N° 81123742".
  const regex = /(?:cuenta(?:\s+en\s+[A-Za-zÀ-ÿ]+)?|cta\.?)\s*(?:N[°ºo]\.?|nro\.?|n[uúü]mero)?\s*[:-]?\s*(\d{5,})/i;
  return regex.exec(texto.slice(desde))?.[1] ?? null;
}

export function parsearComprobanteOcr(texto: string): ComprobanteParseado {
  const t = texto;
  return {
    banco: detectarBanco(t),
    // Primer valor precedido de Gs / GS / PYG.
    monto: normalizarMonto(capturar(/(?:Gs|GS|PYG)\.?[ \t]*(\d[\d.,]*)/, t)),
    nro: capturar(NRO_COMPROBANTE, t) ?? capturar(NRO_OPERACION, t),
    concepto: capturar(/(?:Concepto|Comentario|Referencia)[ \t]*:?[ \t]*\n?[ \t]*(.+)/i, t),
    // "DE" / "PARA" como encabezado de bloque (valor en la misma línea o en las siguientes).
    pagador: capturar(/(?:^|\n)[ \t]*DE[ \t]*:?[ \t]*\n?([\s\S]+?)(?=\n[ \t]*PARA\b|\n[ \t]*\n|$)/i, t),
    beneficiario: capturar(
      /(?:^|\n)[ \t]*PARA[ \t]*:?[ \t]*\n?([\s\S]+?)(?=\n[ \t]*(?:Concepto|Comentario|Nro|Cuenta[ \t]+en|N[°º]|N[uúü]mero|Realizada)|\n[ \t]*\n|$)/i,
      t,
    ),
    cuentaDestino: extraerCuentaDestino(t),
    fecha: extraerFechaComprobante(t),
  };
}
