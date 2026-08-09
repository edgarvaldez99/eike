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
