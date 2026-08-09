/**
 * Convierte un string "YYYY-MM-DDTHH:mm" (de un <input type="datetime-local">,
 * siempre en hora de Paraguay) a un Date UTC correcto. Paraguay no tiene
 * horario de verano desde octubre de 2024, así que el offset -03:00 es fijo
 * para cualquier fecha futura — que es el único caso de uso acá (alta/edición
 * de eventos). Para conversiones de datos HISTÓRICOS ver
 * scripts/migrar-mariadb.ts, que usa `AT TIME ZONE` en SQL en vez de esto.
 */
export function interpretarFechaLocal(fechaHoraLocal: string): Date {
  return new Date(`${fechaHoraLocal}:00-03:00`);
}

/** Para precargar un <input type="datetime-local"> con un Date ya guardado. */
export function aFechaHoraLocalInput(fecha: Date): string {
  const formateador = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Asuncion",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  // sv-SE da "YYYY-MM-DD HH:mm"; datetime-local necesita "YYYY-MM-DDTHH:mm".
  return formateador.format(fecha).replace(" ", "T");
}
