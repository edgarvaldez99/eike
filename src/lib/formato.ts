/** Hasta 2 iniciales en mayúscula a partir de un nombre completo (para el avatar). */
export function iniciales(nombre: string): string {
  return nombre
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]!.toUpperCase())
    .join("");
}

const formateadorGs = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 });

/** Monto en guaraníes con separador de miles es-PY, ej. "₲ 1.320.000". */
export function formatoGs(monto: number): string {
  return `₲ ${formateadorGs.format(monto)}`;
}

const formateadorFecha = new Intl.DateTimeFormat("es-PY", {
  timeZone: "America/Asuncion",
  day: "2-digit",
  month: "short",
  year: "numeric",
});

/** Fecha corta en la zona horaria de Paraguay, ej. "14 ago 2026". Siempre formatear en el servidor. */
export function formatoFecha(fecha: Date): string {
  return formateadorFecha.format(fecha);
}

const formateadorFechaPill = new Intl.DateTimeFormat("es-PY", {
  timeZone: "America/Asuncion",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const formateadorDiaSemana = new Intl.DateTimeFormat("es-PY", {
  timeZone: "America/Asuncion",
  weekday: "long",
});

/**
 * Fecha con el formato de marca del mockup (eike-webKV.pdf), ej.
 * "23 | 08 | 2026", o con el día de la semana adelante, ej.
 * "Domingo 23 | 08 | 2026". Siempre formatear en el servidor.
 */
export function formatoFechaPill(fecha: Date, opciones?: { conDiaSemana?: boolean }): string {
  const partes = formateadorFechaPill.formatToParts(fecha);
  const valor = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "";
  const ddMmYyyy = `${valor("day")} | ${valor("month")} | ${valor("year")}`;
  if (!opciones?.conDiaSemana) return ddMmYyyy;
  const diaSemana = formateadorDiaSemana.format(fecha);
  return `${diaSemana.charAt(0).toUpperCase()}${diaSemana.slice(1)} ${ddMmYyyy}`;
}

/**
 * Link "click to chat" de WhatsApp (wa.me), con el mensaje pre-cargado.
 * wa.me exige el número en formato internacional, sin "+", espacios ni
 * guiones — un celular paraguayo cargado en formato local (ej. 0991234567)
 * lleva el 0 inicial reemplazado por el código de país 595.
 */
export function linkWhatsapp(numero: string, texto: string): string {
  const digitos = numero.replace(/\D/g, "");
  const numeroInternacional = digitos.startsWith("0") ? `595${digitos.slice(1)}` : digitos;
  return `https://wa.me/${numeroInternacional}?text=${encodeURIComponent(texto)}`;
}

/** "Vence en 3h" / "Vencido, se libera pronto" — para la cola de aprobaciones.
 * Se calcula en el servidor a propósito (nunca mandar la fecha cruda y restar
 * en el cliente): el reloj de un celular real puede estar minutos desviado. */
export function formatoVenceEn(reservadoHasta: Date | null): string | null {
  if (!reservadoHasta) return null;
  const msRestantes = reservadoHasta.getTime() - Date.now();
  if (msRestantes <= 0) return "Vencido, se libera pronto";
  const horas = Math.ceil(msRestantes / (60 * 60 * 1000));
  if (horas < 1) return "Vence en menos de 1h";
  if (horas < 24) return `Vence en ${horas}h`;
  return `Vence en ${Math.ceil(horas / 24)}d`;
}
