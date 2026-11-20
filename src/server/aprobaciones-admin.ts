import { sql } from "drizzle-orm";
import { db } from "@/db/cliente";
import { coincidenciasPago, type CampoCoincidente } from "@/server/conciliacion/coincidencias";

/**
 * Backoffice del superadmin para aprobar compras a mano (/panel/admin/aprobaciones).
 * Existe mientras Meta no verifique el negocio y el comprobante por WhatsApp no
 * llega solo: el superadmin compara el comprobante que subió el comprador (y lo
 * que le mandaron por WhatsApp) contra su banco y aprueba o rechaza.
 *
 * A diferencia de tickets.ts::obtenerPendientes (agregada por orden y pensada
 * para el organizador de UN evento), acá se lista TODO lo pendiente de la
 * plataforma, con los datos de contacto y los cruces automáticos.
 */

export interface ComprobanteWaResumen {
  id: number;
  waFrom: string;
  monto: number | null;
  pagador: string | null;
  estado: string;
  nroComprobante: string | null;
  /** Qué leyó el OCR de la foto, para cotejar contra el correo del banco. */
  banco: string | null;
  cuentaDestino: string | null;
  /** "DD/MM/AAAA HH:MM" */
  fecha: string | null;
  /** De dónde vino: la foto que mandó por WhatsApp o la que subió en el checkout. */
  origen: "whatsapp" | "carrito";
  /** Qué datos coincidieron con el aviso del banco cuando se confirmó el doble check. */
  coincidenciasRegistradas: string[];
}

export interface AvisoBancoResumen {
  id: number;
  monto: number | null;
  pagador: string | null;
  operacion: string | null;
  referencia: string | null;
  banco: string | null;
  /** Fecha y hora de la operación, tal cual viene en el correo. */
  fechaOperacion: string | null;
  estado: string;
  recibidoEn: Date;
  /** true si la firma DKIM del banco se verificó. */
  autenticado: boolean;
  /** Cuenta que recibió la plata, para compararla con la del comprobante (null si el banco no la informa). */
  cuentaDestino: string | null;
  /** Texto del correo del banco (puede faltar en avisos viejos). */
  cuerpo: string | null;
  /** Qué datos del aviso coinciden con los comprobantes de WhatsApp de la misma orden (vacío = ninguno, o no hay comprobantes). */
  coincidencias: CampoCoincidente[];
}

export interface OrdenParaAprobar {
  id: number;
  codigo: string;
  estado: string;
  nombreComprador: string;
  cedula: string | null;
  email: string;
  contacto: string | null;
  /** Nº de comprobante que tipeó el comprador (opcional en el checkout). */
  comprobanteTexto: string | null;
  /** null = la orden no tiene archivo de comprobante (ej. compra gratuita). */
  comprobanteTipo: "imagen" | "pdf" | null;
  eventoId: number;
  eventoNombre: string;
  organizadorNombre: string;
  cantidadTickets: number;
  total: number;
  fechaCompra: Date;
  reservadoHasta: Date | null;
  comprobantesWa: ComprobanteWaResumen[];
  avisosBanco: AvisoBancoResumen[];
  /**
   * Avisos del banco recientes sin atar a ninguna orden, para cotejar a mano: primero los del MISMO monto,
   * y después los demás (un comprador que pagó de menos no coincide por monto, y justo eso hay que ver).
   */
  avisosCandidatos: AvisoBancoResumen[];
}

type AvisoCrudo = Omit<AvisoBancoResumen, "coincidencias" | "recibidoEn"> & { recibidoEn: string };

type FilaOrden = {
  id: number;
  codigo: string;
  estado: string;
  nombre_comprador: string;
  cedula: string | null;
  email: string;
  contacto: string | null;
  comprobante: string | null;
  comprobante_archivo: string | null;
  evento_id: number;
  evento_nombre: string;
  organizador_nombre: string;
  cantidad_tickets: number;
  total: number;
  creado_en: string;
  reservado_hasta: string | null;
  comprobantes_wa: Array<Omit<ComprobanteWaResumen, "coincidenciasRegistradas"> & { coincidencias: string | null }>;
  avisos_banco: AvisoCrudo[];
  avisos_candidatos: AvisoCrudo[];
};

function tipoComprobante(archivo: string | null): "imagen" | "pdf" | null {
  if (!archivo) return null;
  return archivo.toLowerCase().endsWith(".pdf") ? "pdf" : "imagen";
}

/** Campos que coinciden entre el aviso y AL MENOS UN comprobante de la orden, sin repetir. */
function unirCoincidencias(
  comprobantes: ComprobanteWaResumen[],
  aviso: Pick<AvisoBancoResumen, "monto" | "pagador" | "operacion" | "referencia" | "cuentaDestino" | "fechaOperacion">,
): CampoCoincidente[] {
  const campos = new Set<CampoCoincidente>();
  for (const c of comprobantes) {
    for (const campo of coincidenciasPago(c, aviso)) campos.add(campo);
  }
  return [...campos];
}

function aAviso(comprobantes: ComprobanteWaResumen[], aviso: AvisoCrudo): AvisoBancoResumen {
  return {
    ...aviso,
    recibidoEn: new Date(aviso.recibidoEn),
    coincidencias: unirCoincidencias(comprobantes, aviso),
  };
}

function aOrden(f: FilaOrden): OrdenParaAprobar {
  const comprobantes: ComprobanteWaResumen[] = f.comprobantes_wa.map(({ coincidencias, ...resto }) => ({
    ...resto,
    coincidenciasRegistradas: coincidencias ? coincidencias.split(",") : [],
  }));
  return {
    id: Number(f.id),
    codigo: f.codigo,
    estado: f.estado,
    nombreComprador: f.nombre_comprador,
    cedula: f.cedula,
    email: f.email,
    contacto: f.contacto,
    comprobanteTexto: f.comprobante,
    comprobanteTipo: tipoComprobante(f.comprobante_archivo),
    eventoId: Number(f.evento_id),
    eventoNombre: f.evento_nombre,
    organizadorNombre: f.organizador_nombre,
    cantidadTickets: Number(f.cantidad_tickets),
    total: Number(f.total),
    fechaCompra: new Date(f.creado_en),
    reservadoHasta: f.reservado_hasta ? new Date(f.reservado_hasta) : null,
    comprobantesWa: comprobantes,
    avisosBanco: f.avisos_banco.map((aviso) => aAviso(comprobantes, aviso)),
    avisosCandidatos: f.avisos_candidatos.map((aviso) => aAviso(comprobantes, aviso)),
  };
}

/** Hasta cuántos días atrás se consideran avisos sin asociar para cotejar. */
const DIAS_CANDIDATOS = 3;

const CAMPOS_AVISO = sql.raw(`json_build_object(
  'id', a.id, 'monto', a.monto, 'pagador', a.pagador, 'operacion', a.operacion,
  'referencia', a.referencia, 'banco', a.banco, 'fechaOperacion', a.fecha_operacion,
  'estado', a.estado, 'recibidoEn', a.recibido_en, 'autenticado', a.autenticado,
  'cuentaDestino', a.cuenta_destino, 'cuerpo', a.cuerpo)`);

const PENDIENTES = sql`o.estado = 'pendiente'`;
const RESUELTAS = sql`o.estado IN ('pagada', 'rechazada')`;

async function consultarOrdenes(
  filtroEstado: typeof PENDIENTES,
  orden: typeof PENDIENTES,
  limite: number,
): Promise<OrdenParaAprobar[]> {
  const { rows } = await db.execute<FilaOrden>(sql`
    SELECT o.id, o.codigo, o.estado, o.nombre_comprador, o.cedula, o.email, o.contacto,
           o.comprobante, o.creado_en, o.reservado_hasta, o.cantidad_tickets, o.total,
           COALESCE(o.comprobante_archivo, (
              SELECT t.comprobante_archivo FROM tickets t
               WHERE t.orden_id = o.id AND t.comprobante_archivo IS NOT NULL LIMIT 1
           )) AS comprobante_archivo,
           (SELECT t.evento_id FROM tickets t WHERE t.orden_id = o.id ORDER BY t.id LIMIT 1) AS evento_id,
           (SELECT e.nombre FROM tickets t JOIN eventos e ON e.id = t.evento_id
             WHERE t.orden_id = o.id ORDER BY t.id LIMIT 1) AS evento_nombre,
           u.nombre AS organizador_nombre,
           (SELECT COALESCE(json_agg(json_build_object(
                     'id', c.id, 'waFrom', c.wa_from, 'monto', c.monto, 'pagador', c.pagador,
                     'estado', c.estado, 'nroComprobante', c.nro_comprobante, 'banco', c.banco,
                     'cuentaDestino', c.cuenta_destino, 'fecha', c.fecha_operacion, 'origen', c.origen,
                     'coincidencias', c.coincidencias) ORDER BY c.id), '[]'::json)
              FROM comprobantes_whatsapp c WHERE c.orden_id = o.id) AS comprobantes_wa,
           (SELECT COALESCE(json_agg(${CAMPOS_AVISO} ORDER BY a.id), '[]'::json)
              FROM avisos_banco a WHERE a.orden_id = o.id) AS avisos_banco,
           (SELECT COALESCE(json_agg(${CAMPOS_AVISO} ORDER BY (a.monto = o.total) DESC NULLS LAST, a.recibido_en DESC, a.id DESC), '[]'::json)
              FROM (SELECT * FROM avisos_banco
                     WHERE orden_id IS NULL AND estado IN ('sin_cruzar', 'ambiguo')
                       AND recibido_en > now() - make_interval(days => ${DIAS_CANDIDATOS})
                     ORDER BY (monto = o.total) DESC NULLS LAST, recibido_en DESC, id DESC LIMIT 50) a) AS avisos_candidatos
      FROM ordenes o
      JOIN usuarios u ON u.id = o.organizador_id
     WHERE ${filtroEstado}
     ORDER BY ${orden}
     LIMIT ${limite}
  `);
  return rows.map(aOrden);
}

/** Cola completa de compras pendientes de la plataforma, la más vieja primero. */
export function listarOrdenesPendientes(): Promise<OrdenParaAprobar[]> {
  return consultarOrdenes(PENDIENTES, sql`o.creado_en ASC`, 200);
}

/** Últimas compras ya resueltas (pagada/rechazada), para poder revisar lo que se hizo. */
export function listarOrdenesResueltas(limite = 15): Promise<OrdenParaAprobar[]> {
  return consultarOrdenes(RESUELTAS, sql`o.actualizado_en DESC`, limite);
}

export interface AvisoBancoSinOrden {
  id: number;
  monto: number | null;
  pagador: string | null;
  operacion: string | null;
  banco: string | null;
  estado: string;
  recibidoEn: Date;
}

/**
 * Avisos del banco que llegaron por correo y todavía no quedaron atados a una
 * orden: son la "plata que entró" para cotejar a ojo con las pendientes.
 */
export async function listarAvisosBancoSinOrden(limite = 20): Promise<AvisoBancoSinOrden[]> {
  const { rows } = await db.execute<{
    id: number;
    monto: number | null;
    pagador: string | null;
    operacion: string | null;
    banco: string | null;
    estado: string;
    recibido_en: string;
  }>(sql`
    SELECT id, monto, pagador, operacion, banco, estado, recibido_en
      FROM avisos_banco
     WHERE orden_id IS NULL AND estado IN ('sin_cruzar', 'ambiguo')
     ORDER BY recibido_en DESC
     LIMIT ${limite}
  `);
  return rows.map((f) => ({
    id: Number(f.id),
    monto: f.monto === null ? null : Number(f.monto),
    pagador: f.pagador,
    operacion: f.operacion,
    banco: f.banco,
    estado: f.estado,
    recibidoEn: new Date(f.recibido_en),
  }));
}

/** Cantidad de compras pendientes de aprobación (para el contador de la pestaña). */
export async function contarOrdenesPendientes(): Promise<number> {
  const { rows } = await db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM ordenes WHERE estado = 'pendiente'`);
  return Number(rows[0].n);
}
