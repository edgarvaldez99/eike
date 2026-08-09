/**
 * Migración de datos: MariaDB (proyecto PHP viejo, "ticketapi") → PostgreSQL
 * (este proyecto). Ver plan de migración §7 para el diseño completo.
 *
 * Uso:  pnpm migrar
 *
 * Fuente: variables MYSQL_* (.env) — contra el docker-compose de ticketapi/
 * (puerto 3307 en el host) para desarrollo/ensayo. Contra producción real
 * (`holasa_eike`, sin SSH) hay que habilitar Remote MySQL en Webuzo, o usar
 * el Plan B: exportar por phpMyAdmin e importar a una MariaDB local efímera
 * — el script es idéntico, solo cambia la connection string.
 *
 * Destino: DATABASE_URL (.env), el Postgres de este proyecto.
 *
 * Idempotente: hace TRUNCATE ... RESTART IDENTITY CASCADE de las 13 tablas
 * antes de cargar, así se puede correr muchas veces (ensayos) sin duplicar
 * ni arrastrar datos de una corrida anterior.
 *
 * Todo el INSERT corre en UNA transacción con `SET CONSTRAINTS ALL DEFERRED`
 * — los 20 FK son DEFERRABLE (ver drizzle/0001_triggers_y_deferrable.sql),
 * así el orden de filas dentro de cada tabla (ej. usuarios.invitado_por
 * auto-referenciado) no importa: solo se valida al COMMIT.
 *
 * Después de cargar, corre las validaciones de integridad (§7.5) y termina
 * con código de salida ≠ 0 si alguna no cierra.
 */
import mysql from "mysql2/promise";
import { Client } from "pg";
import {
  APROBACION_GRATUITO,
  ESTADOS_ASIENTO,
  ESTADOS_EVENTO,
  ESTADOS_LIQUIDACION,
  ESTADOS_PAGO,
  ESTADOS_REEMBOLSO,
  ESTADOS_SUSCRIPCION,
  ESTADOS_TANDA,
  ESTADOS_TICKET,
  ESTADOS_USUARIO,
  METODOS_PAGO,
  ROLES,
  TIPOS_TANDA,
} from "../src/lib/constantes";
import fs from "node:fs/promises";
import path from "node:path";

// ============================================================================
// Transformaciones (ver plan §7.4 — una por una)
// ============================================================================

/** $2y$ (PHP 8.3 password_hash) → $2b$ (mismo algoritmo bcrypt). Aborta si la forma es rara. */
function reescribirHashBcrypt(hash: string, contexto: string): string {
  const reescrito = hash.replace(/^\$2y\$/, "$2b$");
  if (!/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(reescrito)) {
    throw new Error(`${contexto}: hash bcrypt con forma inesperada ("${hash}").`);
  }
  return reescrito;
}

/** '' del PHP (campo vacío) se normaliza a NULL, igual que en el resto del sistema. */
function aTextoONull(valor: string | null): string | null {
  return valor === null || valor === "" ? null : valor;
}

/** TINYINT(1) de MariaDB (0/1) → boolean real de Postgres. */
function aBooleano(valor: number | boolean | null): boolean {
  return Boolean(valor);
}

function validarEnum<T extends string>(
  valor: string,
  dominio: readonly T[],
  contexto: string,
): T {
  if (!dominio.includes(valor as T)) {
    throw new Error(`${contexto}: valor "${valor}" fuera de dominio (${dominio.join(", ")}).`);
  }
  return valor as T;
}

/** DECIMAL(12,0)/(14,0) → bigint. Aborta si no es un entero seguro o es negativo. */
function aEnteroSeguro(valor: unknown, contexto: string): number {
  const n = typeof valor === "string" ? Number(valor) : (valor as number);
  if (!Number.isSafeInteger(n) || n < 0) {
    throw new Error(`${contexto}: valor fuera de rango o negativo (${valor}).`);
  }
  return n;
}

/** 'uploads/comprobantes/EIK-XXX.jpg' → 'EIK-XXX.jpg' (solo basename, ver plan §3(d)/§7.4). */
function basename(ruta: string | null): string | null {
  if (!ruta) return null;
  return ruta.split("/").pop() ?? ruta;
}

// ============================================================================
// Config
// ============================================================================

function leerEnv(nombre: string, porDefecto?: string): string {
  const valor = process.env[nombre] ?? porDefecto;
  if (valor === undefined) throw new Error(`Falta la variable de entorno ${nombre}.`);
  return valor;
}

const ORIGEN = {
  host: leerEnv("MYSQL_HOST", "localhost"),
  port: Number(leerEnv("MYSQL_PORT", "3307")),
  user: leerEnv("MYSQL_USER", "eike"),
  password: leerEnv("MYSQL_PASSWORD", "eike_local"),
  database: leerEnv("MYSQL_DATABASE", "eike"),
};

const UPLOADS_DIR_ORIGEN = process.env.UPLOADS_DIR_ORIGEN || null;

const TABLAS_EN_ORDEN = [
  "usuarios",
  "eventos",
  "tandas",
  "asientos",
  "tickets",
  "pagos",
  "staff_eventos",
  "staff_invitaciones",
  "planes_suscripcion",
  "organizador_suscripciones",
  "liquidaciones",
  "reembolsos",
  "faq_base_conocimiento",
] as const;

// ============================================================================
// Migración por tabla — cada función devuelve la cantidad de filas migradas
// ============================================================================

async function migrarUsuarios(origen: mysql.Connection, pg: Client): Promise<number> {
  const [filas] = await origen.query<mysql.RowDataPacket[]>("SELECT * FROM usuarios");
  for (const f of filas) {
    await pg.query(
      `INSERT INTO usuarios
         (id, nombre, email, password_hash, rol, telefono, cedula, estado,
          motivo_rechazo, ruc_facturacion, tyc_aceptado_en, invitado_por, creado_en)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
               $11::timestamp AT TIME ZONE 'America/Asuncion',
               $12,
               $13::timestamp AT TIME ZONE 'America/Asuncion')`,
      [
        f.id,
        f.nombre,
        f.email,
        reescribirHashBcrypt(f.password_hash, `usuarios.id=${f.id}`),
        validarEnum(f.rol, ROLES, `usuarios.id=${f.id}.rol`),
        aTextoONull(f.telefono),
        aTextoONull(f.cedula),
        validarEnum(f.estado, ESTADOS_USUARIO, `usuarios.id=${f.id}.estado`),
        aTextoONull(f.motivo_rechazo),
        aTextoONull(f.ruc_facturacion),
        f.tyc_aceptado_en,
        f.invitado_por,
        f.creado_en,
      ],
    );
  }
  return filas.length;
}

async function migrarEventos(origen: mysql.Connection, pg: Client): Promise<number> {
  const [filas] = await origen.query<mysql.RowDataPacket[]>("SELECT * FROM eventos");
  for (const f of filas) {
    await pg.query(
      `INSERT INTO eventos
         (id, organizador_id, nombre, descripcion, fecha_evento, lugar, afiche_url,
          aforo_total, es_gratuito, aprobacion_gratuito, estado, fecha_evento_original, creado_en)
       VALUES ($1,$2,$3,$4,
               $5::timestamp AT TIME ZONE 'America/Asuncion',
               $6,$7,$8,$9,$10,$11,
               $12::timestamp AT TIME ZONE 'America/Asuncion',
               $13::timestamp AT TIME ZONE 'America/Asuncion')`,
      [
        f.id,
        f.organizador_id,
        f.nombre,
        aTextoONull(f.descripcion),
        f.fecha_evento,
        aTextoONull(f.lugar),
        aTextoONull(f.afiche_url),
        f.aforo_total,
        aBooleano(f.es_gratuito),
        validarEnum(f.aprobacion_gratuito, APROBACION_GRATUITO, `eventos.id=${f.id}.aprobacion_gratuito`),
        validarEnum(f.estado, ESTADOS_EVENTO, `eventos.id=${f.id}.estado`),
        f.fecha_evento_original,
        f.creado_en,
      ],
    );
  }
  return filas.length;
}

async function migrarTandas(origen: mysql.Connection, pg: Client): Promise<number> {
  const [filas] = await origen.query<mysql.RowDataPacket[]>("SELECT * FROM tandas");
  for (const f of filas) {
    await pg.query(
      `INSERT INTO tandas
         (id, evento_id, nombre, tipo, precio, cantidad_total, cantidad_vendida, estado)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        f.id,
        f.evento_id,
        f.nombre,
        validarEnum(f.tipo, TIPOS_TANDA, `tandas.id=${f.id}.tipo`),
        aEnteroSeguro(f.precio, `tandas.id=${f.id}.precio`),
        f.cantidad_total,
        f.cantidad_vendida,
        validarEnum(f.estado, ESTADOS_TANDA, `tandas.id=${f.id}.estado`),
      ],
    );
  }
  return filas.length;
}

async function migrarAsientos(origen: mysql.Connection, pg: Client): Promise<number> {
  const [filas] = await origen.query<mysql.RowDataPacket[]>("SELECT * FROM asientos");
  for (const f of filas) {
    await pg.query(
      `INSERT INTO asientos (id, tanda_id, identificador, fila, numero, estado)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        f.id,
        f.tanda_id,
        f.identificador,
        aTextoONull(f.fila),
        f.numero,
        validarEnum(f.estado, ESTADOS_ASIENTO, `asientos.id=${f.id}.estado`),
      ],
    );
  }
  return filas.length;
}

async function migrarTickets(origen: mysql.Connection, pg: Client): Promise<number> {
  const [filas] = await origen.query<mysql.RowDataPacket[]>("SELECT * FROM tickets");
  for (const f of filas) {
    await pg.query(
      `INSERT INTO tickets
         (id, codigo, evento_id, tanda_id, asiento_id, comprador_id, nombre_comprador,
          cedula, email, contacto, comprobante, comprobante_archivo, estado, es_cortesia,
          reservado_hasta, aprobado_por, fecha_compra, hora_ingreso, actualizado_en)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,
               $15::timestamp AT TIME ZONE 'America/Asuncion',
               $16,
               $17::timestamp AT TIME ZONE 'America/Asuncion',
               $18::timestamp AT TIME ZONE 'America/Asuncion',
               $19::timestamp AT TIME ZONE 'America/Asuncion')`,
      [
        f.id,
        f.codigo,
        f.evento_id,
        f.tanda_id,
        f.asiento_id,
        f.comprador_id,
        f.nombre_comprador,
        aTextoONull(f.cedula),
        f.email,
        aTextoONull(f.contacto),
        aTextoONull(f.comprobante),
        basename(aTextoONull(f.comprobante_archivo)),
        validarEnum(f.estado, ESTADOS_TICKET, `tickets.id=${f.id}.estado`),
        aBooleano(f.es_cortesia),
        f.reservado_hasta,
        f.aprobado_por,
        f.fecha_compra,
        f.hora_ingreso,
        f.actualizado_en,
      ],
    );
  }
  return filas.length;
}

async function migrarPagos(origen: mysql.Connection, pg: Client): Promise<number> {
  const [filas] = await origen.query<mysql.RowDataPacket[]>("SELECT * FROM pagos");
  for (const f of filas) {
    await pg.query(
      `INSERT INTO pagos (id, ticket_id, monto, metodo, referencia_externa, estado, creado_en)
       VALUES ($1,$2,$3,$4,$5,$6,$7::timestamp AT TIME ZONE 'America/Asuncion')`,
      [
        f.id,
        f.ticket_id,
        aEnteroSeguro(f.monto, `pagos.id=${f.id}.monto`),
        validarEnum(f.metodo, METODOS_PAGO, `pagos.id=${f.id}.metodo`),
        aTextoONull(f.referencia_externa),
        validarEnum(f.estado, ESTADOS_PAGO, `pagos.id=${f.id}.estado`),
        f.creado_en,
      ],
    );
  }
  return filas.length;
}

async function migrarStaffEventos(origen: mysql.Connection, pg: Client): Promise<number> {
  const [filas] = await origen.query<mysql.RowDataPacket[]>("SELECT * FROM staff_eventos");
  for (const f of filas) {
    await pg.query(
      `INSERT INTO staff_eventos (id, staff_id, evento_id, creado_en)
       VALUES ($1,$2,$3,$4::timestamp AT TIME ZONE 'America/Asuncion')`,
      [f.id, f.staff_id, f.evento_id, f.creado_en],
    );
  }
  return filas.length;
}

async function migrarStaffInvitaciones(origen: mysql.Connection, pg: Client): Promise<number> {
  const [filas] = await origen.query<mysql.RowDataPacket[]>("SELECT * FROM staff_invitaciones");
  for (const f of filas) {
    await pg.query(
      `INSERT INTO staff_invitaciones (id, token, organizador_id, evento_id, expira_en, usado_en, creado_en)
       VALUES ($1,$2,$3,$4,
               $5::timestamp AT TIME ZONE 'America/Asuncion',
               $6::timestamp AT TIME ZONE 'America/Asuncion',
               $7::timestamp AT TIME ZONE 'America/Asuncion')`,
      [f.id, f.token, f.organizador_id, f.evento_id, f.expira_en, f.usado_en, f.creado_en],
    );
  }
  return filas.length;
}

async function migrarPlanesSuscripcion(origen: mysql.Connection, pg: Client): Promise<number> {
  const [filas] = await origen.query<mysql.RowDataPacket[]>("SELECT * FROM planes_suscripcion");
  for (const f of filas) {
    await pg.query(
      `INSERT INTO planes_suscripcion
         (id, nombre, tickets_incluidos_mes, precio_mensual, comision_excedente_pct, activo)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        f.id,
        f.nombre,
        f.tickets_incluidos_mes,
        aEnteroSeguro(f.precio_mensual, `planes_suscripcion.id=${f.id}.precio_mensual`),
        f.comision_excedente_pct,
        aBooleano(f.activo),
      ],
    );
  }
  return filas.length;
}

async function migrarOrganizadorSuscripciones(origen: mysql.Connection, pg: Client): Promise<number> {
  const [filas] = await origen.query<mysql.RowDataPacket[]>("SELECT * FROM organizador_suscripciones");
  for (const f of filas) {
    await pg.query(
      `INSERT INTO organizador_suscripciones
         (id, organizador_id, plan_id, estado, fecha_inicio, fecha_proxima_facturacion)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        f.id,
        f.organizador_id,
        f.plan_id,
        validarEnum(f.estado, ESTADOS_SUSCRIPCION, `organizador_suscripciones.id=${f.id}.estado`),
        f.fecha_inicio,
        f.fecha_proxima_facturacion,
      ],
    );
  }
  return filas.length;
}

async function migrarLiquidaciones(origen: mysql.Connection, pg: Client): Promise<number> {
  const [filas] = await origen.query<mysql.RowDataPacket[]>("SELECT * FROM liquidaciones");
  for (const f of filas) {
    await pg.query(
      `INSERT INTO liquidaciones
         (id, organizador_id, periodo_inicio, periodo_fin, total_vendido,
          monto_comision_o_suscripcion, estado, liquidado_en, creado_en)
       VALUES ($1,$2,$3,$4,$5,$6,$7,
               $8::timestamp AT TIME ZONE 'America/Asuncion',
               $9::timestamp AT TIME ZONE 'America/Asuncion')`,
      [
        f.id,
        f.organizador_id,
        f.periodo_inicio,
        f.periodo_fin,
        aEnteroSeguro(f.total_vendido, `liquidaciones.id=${f.id}.total_vendido`),
        aEnteroSeguro(f.monto_comision_o_suscripcion, `liquidaciones.id=${f.id}.monto_comision_o_suscripcion`),
        validarEnum(f.estado, ESTADOS_LIQUIDACION, `liquidaciones.id=${f.id}.estado`),
        f.liquidado_en,
        f.creado_en,
      ],
    );
  }
  return filas.length;
}

async function migrarReembolsos(origen: mysql.Connection, pg: Client): Promise<number> {
  const [filas] = await origen.query<mysql.RowDataPacket[]>("SELECT * FROM reembolsos");
  for (const f of filas) {
    await pg.query(
      `INSERT INTO reembolsos (id, ticket_id, evento_id, canon_pagado, estado, solicitado_en, procesado_en)
       VALUES ($1,$2,$3,$4,$5,
               $6::timestamp AT TIME ZONE 'America/Asuncion',
               $7::timestamp AT TIME ZONE 'America/Asuncion')`,
      [
        f.id,
        f.ticket_id,
        f.evento_id,
        aBooleano(f.canon_pagado),
        validarEnum(f.estado, ESTADOS_REEMBOLSO, `reembolsos.id=${f.id}.estado`),
        f.solicitado_en,
        f.procesado_en,
      ],
    );
  }
  return filas.length;
}

async function migrarFaq(origen: mysql.Connection, pg: Client): Promise<number> {
  const [filas] = await origen.query<mysql.RowDataPacket[]>("SELECT * FROM faq_base_conocimiento");
  for (const f of filas) {
    await pg.query(
      `INSERT INTO faq_base_conocimiento (id, organizador_id, pregunta, respuesta, categoria)
       VALUES ($1,$2,$3,$4,$5)`,
      [f.id, f.organizador_id, f.pregunta, f.respuesta, aTextoONull(f.categoria)],
    );
  }
  return filas.length;
}

async function fijarSecuencias(pg: Client): Promise<void> {
  for (const tabla of TABLAS_EN_ORDEN) {
    await pg.query(
      `SELECT setval(pg_get_serial_sequence('${tabla}', 'id'), COALESCE((SELECT max(id) FROM ${tabla}), 0) + 1, false)`,
    );
  }
}

// ============================================================================
// Validaciones post-migración (plan §7.5) — reporta todo, aborta si algo
// crítico no cierra. Los ítems marcados "solo reporta" no bloquean: son
// derivas de calidad de datos que puede haber en la base real, se muestran
// para decidir con el usuario (ver plan §7.5, ítem 5 y 9).
// ============================================================================

interface ResultadoValidacion {
  nombre: string;
  ok: boolean;
  detalle: string;
  bloqueante: boolean;
}

async function validar(origen: mysql.Connection, pg: Client): Promise<ResultadoValidacion[]> {
  const resultados: ResultadoValidacion[] = [];

  // 1) Conteo de filas por tabla
  for (const tabla of TABLAS_EN_ORDEN) {
    const [[filaOrigen]] = await origen.query<mysql.RowDataPacket[]>(
      `SELECT count(*) AS n FROM ${tabla}`,
    );
    const { rows } = await pg.query(`SELECT count(*) AS n FROM ${tabla}`);
    const nOrigen = Number(filaOrigen.n);
    const nDestino = Number(rows[0].n);
    resultados.push({
      nombre: `Conteo de filas — ${tabla}`,
      ok: nOrigen === nDestino,
      detalle: `origen=${nOrigen} destino=${nDestino}`,
      bloqueante: true,
    });
  }

  // 2) Agregados de negocio: suma de precio de tandas
  const [[sumaTandasOrigen]] = await origen.query<mysql.RowDataPacket[]>(
    "SELECT COALESCE(SUM(precio),0) AS s FROM tandas",
  );
  const { rows: sumaTandasDestino } = await pg.query("SELECT COALESCE(SUM(precio),0) AS s FROM tandas");
  resultados.push({
    nombre: "Suma de precio — tandas",
    ok: Number(sumaTandasOrigen.s) === Number(sumaTandasDestino[0].s),
    detalle: `origen=${sumaTandasOrigen.s} destino=${sumaTandasDestino[0].s}`,
    bloqueante: true,
  });

  // 3) Conteo de tickets por estado. OJO: MariaDB ordena un ENUM por su orden
  //    de declaración ('pendiente','disponible','usado','anulado'), no
  //    alfabético; Postgres (estado es `text`) sí ordena alfabético. El
  //    ORDER BY de ambas queries es solo para debug — la comparación real
  //    tiene que ser por clave, no por el orden en que llegaron las filas.
  const [filasEstadoOrigen] = await origen.query<mysql.RowDataPacket[]>(
    "SELECT estado, count(*) AS n FROM tickets GROUP BY estado ORDER BY estado",
  );
  const { rows: filasEstadoDestino } = await pg.query(
    "SELECT estado, count(*) AS n FROM tickets GROUP BY estado ORDER BY estado",
  );
  const aMapaOrdenado = (filas: { estado: string; n: unknown }[]) =>
    Object.fromEntries(
      filas.map((f) => [f.estado, Number(f.n)] as const).sort(([a], [b]) => a.localeCompare(b)),
    );
  const mapaOrigen = aMapaOrdenado(filasEstadoOrigen as { estado: string; n: unknown }[]);
  const mapaDestino = aMapaOrdenado(filasEstadoDestino as { estado: string; n: unknown }[]);
  resultados.push({
    nombre: "Tickets por estado",
    ok: JSON.stringify(mapaOrigen) === JSON.stringify(mapaDestino),
    detalle: `origen=${JSON.stringify(mapaOrigen)} destino=${JSON.stringify(mapaDestino)}`,
    bloqueante: true,
  });

  // 4) Secuencias >= MAX(id) — drizzle-kit nombra cada secuencia "<tabla>_id_seq"
  //    (ver drizzle/0000_late_zaladane.sql). OJO: `pg_sequences.last_value` da
  //    NULL cuando setval() se llamó con is_called=false (nuestro caso — ver
  //    fijarSecuencias): esa columna solo refleja un valor "consumido" por un
  //    nextval() real. Para saber qué id va a entregar el PRÓXIMO nextval()
  //    hay que leer la secuencia misma (siempre expone last_value/is_called,
  //    sin ese matiz de privilegios/lectura de la vista de catálogo).
  for (const tabla of TABLAS_EN_ORDEN) {
    const { rows } = await pg.query(
      `SELECT s.last_value, s.is_called, (SELECT COALESCE(max(id),0) FROM ${tabla}) AS max_id
         FROM "${tabla}_id_seq" s`,
    );
    const { last_value, is_called, max_id } = rows[0];
    const proximoId = is_called ? Number(last_value) + 1 : Number(last_value);
    const ok = proximoId > Number(max_id);
    resultados.push({
      nombre: `Secuencia — ${tabla}`,
      ok,
      detalle: `próximo id=${proximoId} (last_value=${last_value}, is_called=${is_called}) max(id)=${max_id}`,
      bloqueante: true,
    });
  }

  // 5) Integridad de stock (deriva conocida, solo reporta — plan §7.5 ítem 5)
  const { rows: filasStock } = await pg.query(`
    SELECT t.id, t.cantidad_vendida,
           (SELECT count(*) FROM tickets tk WHERE tk.tanda_id = t.id AND tk.estado IN ('pendiente','disponible','usado')) AS reales
      FROM tandas t
  `);
  const derivas = filasStock.filter((f) => Number(f.cantidad_vendida) !== Number(f.reales));
  resultados.push({
    nombre: "Integridad de stock (cantidad_vendida vs. tickets reales)",
    ok: derivas.length === 0,
    detalle:
      derivas.length === 0
        ? "sin derivas"
        : `${derivas.length} tanda(s) con deriva: ${JSON.stringify(derivas)}`,
    bloqueante: false,
  });

  // 6) Hashes bcrypt: 100% con la forma esperada (ya se validó al migrar, se re-confirma)
  const { rows: filasHash } = await pg.query(
    `SELECT count(*) AS n FROM usuarios WHERE password_hash !~ '^\\$2[aby]\\$[0-9]{2}\\$[./A-Za-z0-9]{53}$'`,
  );
  resultados.push({
    nombre: "Hashes bcrypt con forma válida",
    ok: Number(filasHash[0].n) === 0,
    detalle: `${filasHash[0].n} hash(es) con forma inesperada`,
    bloqueante: true,
  });

  // 7) Emails duplicados case-insensitive (ya se chequeó antes de migrar; se re-confirma en destino)
  const { rows: filasDup } = await pg.query(
    "SELECT lower(email) AS e, count(*) AS n FROM usuarios GROUP BY lower(email) HAVING count(*) > 1",
  );
  resultados.push({
    nombre: "Emails duplicados (case-insensitive)",
    ok: filasDup.length === 0,
    detalle: filasDup.length === 0 ? "sin duplicados" : JSON.stringify(filasDup),
    bloqueante: true,
  });

  // 8) Zona horaria: comparar un ticket conocido carácter a carácter
  const [[ticketOrigen]] = await origen.query<mysql.RowDataPacket[]>(
    "SELECT id, fecha_compra FROM tickets ORDER BY id LIMIT 1",
  );
  if (ticketOrigen) {
    const { rows: ticketDestino } = await pg.query(
      "SELECT to_char(fecha_compra AT TIME ZONE 'America/Asuncion', 'YYYY-MM-DD HH24:MI:SS') AS s FROM tickets WHERE id = $1",
      [ticketOrigen.id],
    );
    resultados.push({
      nombre: "Zona horaria (ticket de muestra)",
      ok: ticketDestino[0]?.s === ticketOrigen.fecha_compra,
      detalle: `origen="${ticketOrigen.fecha_compra}" destino="${ticketDestino[0]?.s}"`,
      bloqueante: true,
    });
  }

  // 9) Archivos referenciados existen en disco (se omite si no hay UPLOADS_DIR_ORIGEN)
  if (UPLOADS_DIR_ORIGEN) {
    const { rows: comprobantes } = await pg.query(
      "SELECT comprobante_archivo FROM tickets WHERE comprobante_archivo IS NOT NULL",
    );
    const faltantes: string[] = [];
    for (const fila of comprobantes) {
      const ruta = path.join(UPLOADS_DIR_ORIGEN, "comprobantes", fila.comprobante_archivo);
      try {
        await fs.access(ruta);
      } catch {
        faltantes.push(fila.comprobante_archivo);
      }
    }
    resultados.push({
      nombre: "Archivos de comprobantes en disco",
      ok: faltantes.length === 0,
      detalle: faltantes.length === 0 ? "todos presentes" : `faltan: ${faltantes.join(", ")}`,
      bloqueante: false,
    });
  } else {
    resultados.push({
      nombre: "Archivos de comprobantes en disco",
      ok: true,
      detalle: "omitida (UPLOADS_DIR_ORIGEN vacío)",
      bloqueante: false,
    });
  }

  // 10) Coherencia de asientos
  const { rows: asientosMal } = await pg.query(`
    SELECT a.id, a.estado,
           (SELECT count(*) FROM tickets tk WHERE tk.asiento_id = a.id
              AND tk.estado IN ('pendiente','disponible','usado')) AS tickets_vigentes
      FROM asientos a
     WHERE (a.estado = 'disponible' AND EXISTS (
              SELECT 1 FROM tickets tk WHERE tk.asiento_id = a.id
                AND tk.estado IN ('pendiente','disponible','usado')))
        OR (a.estado IN ('reservado','vendido') AND NOT EXISTS (
              SELECT 1 FROM tickets tk WHERE tk.asiento_id = a.id
                AND tk.estado IN ('pendiente','disponible','usado')))
  `);
  resultados.push({
    nombre: "Coherencia de asientos vs. tickets",
    ok: asientosMal.length === 0,
    detalle: asientosMal.length === 0 ? "sin inconsistencias" : JSON.stringify(asientosMal),
    bloqueante: false,
  });

  return resultados;
}

// ============================================================================
// Main
// ============================================================================

async function principal() {
  console.log(`Conectando a MariaDB origen (${ORIGEN.host}:${ORIGEN.port}/${ORIGEN.database})…`);
  const origen = await mysql.createConnection({ ...ORIGEN, dateStrings: true });

  console.log("Conectando a Postgres destino…");
  const pg = new Client({ connectionString: leerEnv("DATABASE_URL") });
  await pg.connect();

  const resumen: Record<string, number> = {};

  try {
    await pg.query("BEGIN");
    await pg.query("SET CONSTRAINTS ALL DEFERRED");

    console.log("Vaciando el destino (TRUNCATE ... RESTART IDENTITY CASCADE) para una carga limpia…");
    await pg.query(`TRUNCATE TABLE ${TABLAS_EN_ORDEN.join(", ")} RESTART IDENTITY CASCADE`);

    resumen.usuarios = await migrarUsuarios(origen, pg);
    resumen.eventos = await migrarEventos(origen, pg);
    resumen.tandas = await migrarTandas(origen, pg);
    resumen.asientos = await migrarAsientos(origen, pg);
    resumen.tickets = await migrarTickets(origen, pg);
    resumen.pagos = await migrarPagos(origen, pg);
    resumen.staff_eventos = await migrarStaffEventos(origen, pg);
    resumen.staff_invitaciones = await migrarStaffInvitaciones(origen, pg);
    resumen.planes_suscripcion = await migrarPlanesSuscripcion(origen, pg);
    resumen.organizador_suscripciones = await migrarOrganizadorSuscripciones(origen, pg);
    resumen.liquidaciones = await migrarLiquidaciones(origen, pg);
    resumen.reembolsos = await migrarReembolsos(origen, pg);
    resumen.faq_base_conocimiento = await migrarFaq(origen, pg);

    await fijarSecuencias(pg);

    await pg.query("COMMIT");
    console.log("\nCarga completa (COMMIT). Filas migradas por tabla:");
    for (const [tabla, n] of Object.entries(resumen)) {
      console.log(`  ${tabla}: ${n}`);
    }
  } catch (error) {
    await pg.query("ROLLBACK");
    console.error("\nLa migración falló — se hizo ROLLBACK, el destino no cambió.");
    throw error;
  }

  console.log("\nCorriendo validaciones post-migración…\n");
  const resultados = await validar(origen, pg);
  let hayFallosBloqueantes = false;
  for (const r of resultados) {
    const marca = r.ok ? "OK  " : r.bloqueante ? "FAIL" : "WARN";
    console.log(`${marca} ${r.nombre} — ${r.detalle}`);
    if (!r.ok && r.bloqueante) hayFallosBloqueantes = true;
  }

  await origen.end();
  await pg.end();

  if (hayFallosBloqueantes) {
    console.error("\nHay validaciones bloqueantes en rojo. Revisar antes de dar la migración por buena.");
    process.exitCode = 1;
  } else {
    console.log("\nTodas las validaciones bloqueantes pasaron.");
  }
}

principal().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
