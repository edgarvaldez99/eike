import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { obtenerTicketPorCodigo } from "@/server/tickets";
import { generarQrSvg } from "@/lib/qr";
import { formatoFecha } from "@/lib/formato";
import { Pill } from "@/componentes/ui/Pill";
import { PILL_ESTADO_TICKET } from "@/lib/estilosEstado";
import { BotonImprimir } from "@/componentes/publico/BotonImprimir";
import type { EstadoTicket } from "@/lib/constantes";

// El código en sí es la credencial (ver server/tickets.ts) — nunca debe
// indexarse ni cachearse.
export const metadata: Metadata = { robots: { index: false, follow: false, nocache: true } };
export const dynamic = "force-dynamic";

const ETIQUETA_ESTADO: Record<string, string> = {
  pendiente: "Pendiente de aprobación",
  disponible: "Disponible",
  usado: "Usado",
  anulado: "Anulado",
};

export default async function PaginaTicket({
  params,
}: {
  params: Promise<{ codigo: string }>;
}) {
  const { codigo } = await params;
  const ticket = await obtenerTicketPorCodigo(codigo);
  if (!ticket) notFound();

  const qrSvg = await generarQrSvg(ticket.codigo);

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-4 print:max-w-none">
      <div className="eike-card p-6 text-center">
        {ticket.aficheUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={ticket.aficheUrl}
            alt=""
            className="mx-auto mb-4 max-w-[200px] rounded-[var(--radius-eike-sm)] border border-border"
          />
        ) : null}

        <div
          className="mx-auto w-[220px] [&>svg]:h-full [&>svg]:w-full"
          dangerouslySetInnerHTML={{ __html: qrSvg }}
        />

        <h1 className="mt-4 text-lg font-extrabold">{ticket.eventoNombre}</h1>
        <p className="text-[13px] text-muted">{formatoFecha(ticket.fechaEvento)}</p>
        {ticket.lugar ? <p className="text-[13px] text-muted">{ticket.lugar}</p> : null}

        <div className="my-4 border-t border-border-soft" />

        <p className="eike-eyebrow">Entrada a nombre de</p>
        <p className="font-bold">
          {ticket.nombreComprador}
          {ticket.cedula ? <span className="ml-2 font-normal text-muted">CI: {ticket.cedula}</span> : null}
        </p>

        <div className="mt-4 flex justify-between text-left text-[13px]">
          <div>
            <div className="eike-eyebrow">Tanda</div>
            <div>
              {ticket.tandaNombre}
              {ticket.asientoIdentificador ? ` · ${ticket.asientoIdentificador}` : ""}
            </div>
          </div>
          <div className="text-right">
            <div className="eike-eyebrow">Estado</div>
            <Pill variante={PILL_ESTADO_TICKET[ticket.estado as EstadoTicket] ?? "neutral"}>
              {ETIQUETA_ESTADO[ticket.estado] ?? ticket.estado}
            </Pill>
          </div>
        </div>

        <p className="mt-6 text-[11px] text-muted-dim">
          CÓDIGO {ticket.codigo}
          <br />
          No compartas ni dupliques este ticket — es de un único acceso.
        </p>
      </div>
      <div className="text-center print:hidden">
        <BotonImprimir />
      </div>
    </div>
  );
}
