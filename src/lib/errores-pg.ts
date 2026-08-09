/**
 * Traduce errores crudos de Postgres (por código SQLSTATE) a mensajes en
 * español listos para mostrar al usuario. Reemplaza el patrón del PHP de
 * matchear el TEXTO del mensaje de error de la base
 * (`str_contains($e->getMessage(), 'bajar el stock')`), que es frágil.
 * Acá el mapeo es por código, determinístico. Ver plan de migración §4.3.
 */

interface ErrorPostgres {
  code?: string;
  constraint?: string;
}

const MENSAJES_POR_CONSTRAINT: Record<string, string> = {
  chk_tandas_stock: "No se puede bajar el stock de una tanda por debajo de lo ya vendido.",
  uq_usuarios_email_lower: "Ya existe una cuenta con ese email.",
  uq_tickets_codigo: "Ese código de ticket ya existe (colisión improbable, probá de nuevo).",
  uq_staff_invitaciones_token: "Ese token de invitación ya existe (colisión improbable, probá de nuevo).",
};

const MENSAJES_POR_SQLSTATE: Record<string, string> = {
  // Triggers propios (drizzle/0001_triggers_y_deferrable.sql)
  EIK01: "No se puede eliminar una tanda con tickets vendidos. Cancelá o reprogramá el evento.",
  EIK02: "No se puede eliminar un evento con tickets vendidos. Cancelá o reprogramá el evento.",
  // Postgres estándar
  "23503": "Ese registro está referenciado por otros datos y no se puede eliminar.",
  "55P03": "Hubo mucha demanda sobre esa tanda. Probá de nuevo en un momento.",
};

/** true si el error viene del driver `pg` (tiene forma de error de Postgres). */
export function esErrorPostgres(error: unknown): error is ErrorPostgres {
  return typeof error === "object" && error !== null && "code" in error;
}

/**
 * Mensaje amigable para un error de Postgres, o null si no reconocemos el
 * código (en ese caso el llamador debería mostrar un mensaje genérico y
 * loguear el original completo).
 */
export function mensajeAmigablePg(error: unknown): string | null {
  if (!esErrorPostgres(error)) return null;

  if (error.code === "23505" && error.constraint) {
    return MENSAJES_POR_CONSTRAINT[error.constraint] ?? "Ese dato ya existe.";
  }
  if (error.code === "23514" && error.constraint) {
    return MENSAJES_POR_CONSTRAINT[error.constraint] ?? "Ese cambio no cumple una regla de datos válidos.";
  }
  if (error.code && MENSAJES_POR_SQLSTATE[error.code]) {
    return MENSAJES_POR_SQLSTATE[error.code];
  }
  return null;
}
