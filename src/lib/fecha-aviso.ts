/**
 * Fecha y hora de la operación de un aviso del banco ("DD/MM/AAAA HH:MM[:SS]",
 * hora de Paraguay, tal cual viene en el correo) como "AAAA-MM-DDTHH:MM", el mismo
 * formato (sin zona horaria) que devuelve un <input type="datetime-local">. Así se
 * comparan como texto, sin husos horarios de por medio. null si no se puede leer.
 */
export function fechaAvisoAIso(fecha: string | null): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/.exec(fecha ?? "");
  return m ? `${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}` : null;
}

/**
 * ¿El aviso es de la fecha/hora del comprobante o posterior? Un correo del banco
 * no puede ser anterior a la transferencia que avisa. Sin fecha mínima se acepta
 * todo; un aviso sin fecha legible se acepta (no se puede descartar con certeza).
 */
export function avisoDesde(fechaAviso: string | null, minimoIso: string): boolean {
  if (!minimoIso) return true;
  const iso = fechaAvisoAIso(fechaAviso);
  return iso === null || iso >= minimoIso;
}

/** Suma minutos a un "AAAA-MM-DDTHH:MM" (sin zona horaria) y devuelve el mismo formato. */
export function sumarMinutosIso(iso: string, minutos: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(iso);
  if (!m) return iso;
  const fecha = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]) + minutos));
  return fecha.toISOString().slice(0, 16);
}

/**
 * ¿El aviso está dentro de la ventana que empieza en `desdeIso` (la fecha/hora del
 * comprobante) y dura `minutos`? `minutos = null` es sin límite hacia adelante (se
 * extendió la ventana). Sin fecha de inicio se acepta todo, y un aviso sin fecha
 * legible tampoco se descarta (no se puede saber).
 */
export function avisoEnVentana(fechaAviso: string | null, desdeIso: string, minutos: number | null): boolean {
  if (!desdeIso) return true;
  const iso = fechaAvisoAIso(fechaAviso);
  if (iso === null) return true;
  if (iso < desdeIso) return false;
  return minutos === null || iso <= sumarMinutosIso(desdeIso, minutos);
}
