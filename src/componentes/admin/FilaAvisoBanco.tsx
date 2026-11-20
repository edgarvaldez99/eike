import type { AvisoBancoResumen } from "@/server/aprobaciones-admin";
import { estaCorroborado } from "@/server/conciliacion/coincidencias";
import { formatoFecha, formatoGs } from "@/lib/formato";

export const ETIQUETA_COINCIDENCIA = {
  monto: "monto",
  pagador: "pagador",
  comprobante: "Nº de comprobante",
  cuenta: "cuenta destino",
  fecha: "fecha y hora",
} as const;

/** Un correo del banco, con sus datos y (si hace falta) el texto completo, para cotejar contra el comprobante. */
export function FilaAvisoBanco({
  aviso,
  hayComprobanteWa,
  totalOrden,
}: {
  aviso: AvisoBancoResumen;
  hayComprobanteWa: boolean;
  /** Total de la compra: si el aviso es de otro monto se marca (puede ser un pago de menos). */
  totalOrden?: number;
}) {
  const coincide = estaCorroborado(aviso.coincidencias);
  const montoDistinto = totalOrden !== undefined && aviso.monto !== totalOrden;
  return (
    <div className="rounded-[var(--radius-eike-sm)] border border-border bg-surface-2 p-3">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
        <dt className="text-muted">Banco</dt>
        <dd>
          {aviso.banco ?? "—"}{" "}
          <span className={aviso.autenticado ? "text-green" : "text-amarillo-texto"}>
            {aviso.autenticado ? "· firma verificada" : "· firma NO verificada"}
          </span>
        </dd>
        <dt className="text-muted">Monto</dt>
        <dd className="num font-bold">
          {aviso.monto === null ? "—" : formatoGs(aviso.monto)}
          {montoDistinto ? (
            <span className="ml-2 text-[11.5px] font-normal text-red">
              ≠ {formatoGs(totalOrden)} de la compra: verificá que no sea un pago de menos u otro pago
            </span>
          ) : totalOrden !== undefined ? (
            <span className="ml-2 text-[11.5px] font-normal text-green">igual al total de la compra</span>
          ) : null}
        </dd>
        <dt className="text-muted">Pagador</dt>
        <dd>{aviso.pagador ?? "—"}</dd>
        <dt className="text-muted">Cuenta que recibió</dt>
        <dd className="num font-bold">{aviso.cuentaDestino ?? "— (el banco no la informa)"}</dd>
        <dt className="text-muted">Operación</dt>
        <dd className="num">{aviso.operacion ?? "—"}</dd>
        <dt className="text-muted">Fecha</dt>
        <dd className="num">{aviso.fechaOperacion ?? "—"}</dd>
        {aviso.referencia ? (
          <>
            <dt className="text-muted">Concepto</dt>
            <dd>{aviso.referencia}</dd>
          </>
        ) : null}
        <dt className="text-muted">Recibido</dt>
        <dd className="num">{formatoFecha(aviso.recibidoEn)}</dd>
      </dl>
      {hayComprobanteWa ? (
        <p className={coincide ? "mt-1.5 text-green" : "mt-1.5 text-amarillo-texto"}>
          {coincide
            ? `Coincide con la foto del comprobante: ${aviso.coincidencias.map((c) => ETIQUETA_COINCIDENCIA[c]).join(", ")}`
            : "Solo coincide el monto, o ni eso: verificá a mano antes de aprobar"}
        </p>
      ) : null}
      {aviso.cuerpo ? (
        <details className="mt-1.5">
          <summary className="cursor-pointer text-lila-bright">Ver el correo del banco</summary>
          {/* Texto plano del correo: se muestra como texto, nunca como HTML. */}
          <pre className="mt-1.5 max-h-[240px] overflow-auto whitespace-pre-wrap break-words rounded-[var(--radius-eike-sm)] border border-border-soft p-2 font-mono text-[11.5px] text-muted">
            {aviso.cuerpo}
          </pre>
        </details>
      ) : null}
    </div>
  );
}
