import { ErrorNegocio } from "@/lib/errores";

/**
 * Normaliza un celular paraguayo a dígitos con código de país (595XXXXXXXXX),
 * que es el formato en que WhatsApp informa el remitente de un mensaje.
 * Acepta "0981 123 456", "+595 981 123 456", "981123456", etc. Devuelve null
 * si no parece un celular paraguayo (9 dígitos tras el 0 / el 595, empezando en 9).
 */
export function normalizarTelefonoPy(crudo: string | null | undefined): string | null {
  const digitos = (crudo ?? "").replace(/\D/g, "");
  let nacional: string;
  if (digitos.startsWith("595")) nacional = digitos.slice(3);
  else if (digitos.startsWith("0")) nacional = digitos.slice(1);
  else nacional = digitos;
  return /^9\d{8}$/.test(nacional) ? `595${nacional}` : null;
}

/**
 * El comprador escribe su número dos veces (la segunda a mano, sin pegar) para
 * evitar errores de tipeo: acá se revalida en el servidor que sean válidos e
 * iguales. Devuelve el número normalizado (595XXXXXXXXX).
 */
export function exigirContactoConfirmado(contacto: string | null, confirmacion: string | null): string {
  const numero = normalizarTelefonoPy(contacto);
  if (!numero) {
    throw new ErrorNegocio("Ingresá un número de WhatsApp válido, por ejemplo 0981 123 456.");
  }
  if (normalizarTelefonoPy(confirmacion) !== numero) {
    throw new ErrorNegocio("Los dos números de WhatsApp no coinciden. Escribí de nuevo el segundo.");
  }
  return numero;
}
