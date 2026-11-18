/**
 * Qué datos coinciden entre un comprobante de WhatsApp (primer check) y un
 * aviso del banco (segundo check). El MONTO solo no alcanza para dar el pago
 * por confirmado: cualquiera puede mandar un comprobante falso por el mismo
 * monto que una transferencia real de otro. Además del monto tiene que
 * coincidir al menos un dato más (el pagador o el Nº de comprobante).
 *
 * Funciones puras. Se usan en el cruce (cruce.ts) y en el backoffice, que le
 * muestra al superadmin qué campos coincidieron.
 */

export type CampoCoincidente = "monto" | "pagador" | "comprobante";

export interface DatosComprobante {
  monto: number | null;
  pagador: string | null;
  nroComprobante: string | null;
}

export interface DatosAviso {
  monto: number | null;
  pagador: string | null;
  operacion: string | null;
  referencia: string | null;
}

const MINIMO_NRO = 6;

/** Palabras de un nombre: sin acentos, en mayúsculas y sin las muy cortas (de, la, y…). */
function palabras(nombre: string): string[] {
  return nombre
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toUpperCase()
    .split(/[^A-Z]+/)
    .filter((p) => p.length >= 3);
}

/**
 * Dos nombres son del mismo pagador si comparten al menos dos palabras, sin
 * importar el orden ("EDUARDO VALDES" y "VALDES FARIA EDUARDO MANUEL"). Una
 * sola palabra en común (un apellido frecuente) no alcanza.
 */
export function nombresCompatibles(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  const delOtro = new Set(palabras(b));
  const comunes = new Set(palabras(a).filter((p) => delOtro.has(p)));
  return comunes.size >= 2;
}

const alfanumerico = (valor: string) => valor.toUpperCase().replace(/[^A-Z0-9]/g, "");

/**
 * El Nº de comprobante coincide solo si es IGUAL a la operación o a la
 * referencia del aviso. Nunca por "contiene": un número corto aparece por
 * casualidad dentro de un identificador largo de operación (y se puede ir
 * probando números hasta acertar), y la referencia es texto libre que escribe
 * quien paga.
 */
function numerosCompatibles(nro: string | null, aviso: DatosAviso): boolean {
  if (!nro) return false;
  const buscado = alfanumerico(nro);
  if (buscado.length < MINIMO_NRO) return false;
  return [aviso.operacion, aviso.referencia].some((campo) => campo !== null && alfanumerico(campo) === buscado);
}

export function coincidenciasPago(comprobante: DatosComprobante, aviso: DatosAviso): CampoCoincidente[] {
  const campos: CampoCoincidente[] = [];
  if (comprobante.monto !== null && comprobante.monto === aviso.monto) campos.push("monto");
  if (nombresCompatibles(comprobante.pagador, aviso.pagador)) campos.push("pagador");
  if (numerosCompatibles(comprobante.nroComprobante, aviso)) campos.push("comprobante");
  return campos;
}

/** Corroborado = coincide el monto Y algún dato más. */
export function estaCorroborado(campos: CampoCoincidente[]): boolean {
  return campos.includes("monto") && campos.some((c) => c !== "monto");
}
