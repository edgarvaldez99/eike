import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { obtenerOrdenParaMostrar } from "@/server/tickets";
import { formatoFecha } from "@/lib/formato";

// El código de la orden ES la credencial (mismo criterio que un ticket) —
// nunca debe indexarse ni cachearse.
export const metadata: Metadata = { robots: { index: false, follow: false, nocache: true } };
export const dynamic = "force-dynamic";

/**
 * Índice de una compra (Fase 6 del plan de mejoras) — a diferencia de
 * /entradas/[codigo] (un ticket individual, con su QR), esta página solo
 * lista los tickets que trajo la orden: el carrito puede haber comprado
 * varias tandas/unidades de una sola vez, bajo un único comprobante.
 */
export default async function PaginaOrden({
  params,
}: {
  params: Promise<{ codigo: string }>;
}) {
  const { codigo } = await params;
  const orden = await obtenerOrdenParaMostrar(codigo);
  if (!orden) notFound();

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-4">
      <div className="eike-card p-6 text-center">
        <h1 className="text-lg font-extrabold">{orden.eventoNombre}</h1>
        <p className="text-[13px] text-muted">{formatoFecha(orden.fechaEvento)}</p>
        {orden.lugar ? <p className="text-[13px] text-muted">{orden.lugar}</p> : null}

        <div className="my-4 border-t border-border-soft" />

        <p className="eike-eyebrow">
          {orden.tickets.length === 1 ? "Tu entrada" : `Tus ${orden.tickets.length} entradas`}
        </p>
        <div className="mt-2 flex flex-col gap-2">
          {orden.tickets.map((ticket) => (
            <Link
              key={ticket.codigo}
              href={`/entradas/${ticket.codigo}`}
              className="eike-btn eike-btn--ghost flex items-center justify-between"
            >
              <span>
                {ticket.tandaNombre}
                {ticket.asientoIdentificador ? ` · ${ticket.asientoIdentificador}` : ""}
              </span>
              <span>→</span>
            </Link>
          ))}
        </div>

        <p className="mt-6 text-[11px] text-muted-dim">
          CÓDIGO {orden.codigo}
          <br />
          Guardá este link — es tu comprobante de la compra completa.
        </p>
      </div>
    </div>
  );
}
