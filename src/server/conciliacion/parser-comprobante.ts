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
  };
}
