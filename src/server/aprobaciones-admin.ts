import { sql } from "drizzle-orm";
import { db } from "@/db/cliente";

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
  estado: string;
  nroComprobante: string | null;
}

export interface AvisoBancoResumen {
  id: number;
  monto: number | null;
  pagador: string | null;
  operacion: string | null;
  banco: string | null;
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
}

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
  comprobantes_wa: ComprobanteWaResumen[];
  avisos_banco: AvisoBancoResumen[];
};

function tipoComprobante(archivo: string | null): "imagen" | "pdf" | null {
  if (!archivo) return null;
  return archivo.toLowerCase().endsWith(".pdf") ? "pdf" : "imagen";
}

function aOrden(f: FilaOrden): OrdenParaAprobar {
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
    comprobantesWa: f.comprobantes_wa,
    avisosBanco: f.avisos_banco,
  };
}

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
                     'id', c.id, 'waFrom', c.wa_from, 'monto', c.monto,
                     'estado', c.estado, 'nroComprobante', c.nro_comprobante) ORDER BY c.id), '[]'::json)
              FROM comprobantes_whatsapp c WHERE c.orden_id = o.id) AS comprobantes_wa,
           (SELECT COALESCE(json_agg(json_build_object(
                     'id', a.id, 'monto', a.monto, 'pagador', a.pagador,
                     'operacion', a.operacion, 'banco', a.banco) ORDER BY a.id), '[]'::json)
              FROM avisos_banco a WHERE a.orden_id = o.id) AS avisos_banco
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
