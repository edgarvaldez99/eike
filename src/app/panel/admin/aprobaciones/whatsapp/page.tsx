import { requerirSesion } from "@/lib/auth/guardas";
import { listarComprobantesSinOrden, listarDerivacionesAbiertas } from "@/server/whatsapp/atencion";
import { Card } from "@/componentes/ui/Card";
import { AccionesDerivacionWhatsapp } from "@/componentes/admin/AccionesDerivacionWhatsapp";
import { FormularioAsignarComprobante } from "@/componentes/admin/FormularioAsignarComprobante";
import { formatoFecha, formatoGs } from "@/lib/formato";

export const metadata = { robots: { index: false, follow: false } };

export default async function PaginaAprobacionesWhatsapp() {
  await requerirSesion(["superadmin"]);
  const [derivaciones, comprobantes] = await Promise.all([listarDerivacionesAbiertas(), listarComprobantesSinOrden()]);

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3" aria-labelledby="titulo-derivaciones">
        <div>
          <h2 id="titulo-derivaciones" className="text-[15px] font-extrabold">
            Conversaciones para atender ({derivaciones.length})
          </h2>
          <p className="text-[12.5px] text-muted">
            El asistente las pasó a una persona: el cliente pidió hablar con alguien o la pregunta no se podía
            responder con la información disponible. Podés contestarle por WhatsApp mientras no pasen 24 h desde
            su último mensaje.
          </p>
        </div>
        {derivaciones.length === 0 ? (
          <Card>
            <p className="text-[13px] text-muted">No hay conversaciones pendientes.</p>
          </Card>
        ) : (
          derivaciones.map((d) => (
            <Card key={d.id} className="flex flex-col gap-3">
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[13px]">
                <dt className="text-muted">Número</dt>
                <dd className="num">+{d.numero}</dd>
                <dt className="text-muted">Desde</dt>
                <dd>{formatoFecha(d.creadoEn)}</dd>
                <dt className="text-muted">Motivo</dt>
                <dd>{d.motivo}</dd>
                {d.ordenCodigo ? (
                  <>
                    <dt className="text-muted">Compra</dt>
                    <dd className="num">{d.ordenCodigo}</dd>
                  </>
                ) : null}
                <dt className="text-muted">Último mensaje</dt>
                <dd className="whitespace-pre-wrap break-words">{d.ultimoMensaje ?? "—"}</dd>
              </dl>
              <AccionesDerivacionWhatsapp derivacionId={d.id} />
            </Card>
          ))
        )}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="titulo-sin-orden">
        <div>
          <h2 id="titulo-sin-orden" className="text-[15px] font-extrabold">
            Comprobantes sin compra asignada
          </h2>
          <p className="text-[12.5px] text-muted">
            Llegaron por WhatsApp y no se pudieron atar a una compra. Asignalos con el código de la compra y
            aprobá el pago en la pestaña Compras.
          </p>
        </div>
        <Card className="p-0">
          <div className="overflow-x-auto">
            <table className="eike-tabla">
              <thead>
                <tr>
                  <th>Recibido</th>
                  <th>Número</th>
                  <th>Banco</th>
                  <th className="right">Monto</th>
                  <th>Observaciones</th>
                  <th>Asignar</th>
                </tr>
              </thead>
              <tbody>
                {comprobantes.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center text-muted">
                      No hay comprobantes sin asignar.
                    </td>
                  </tr>
                ) : (
                  comprobantes.map((c) => (
                    <tr key={c.id}>
                      <td className="num">{formatoFecha(c.recibidoEn)}</td>
                      <td className="num">
                        +{c.waFrom}
                        {c.nombrePerfil ? <span className="block text-[11.5px] text-muted">{c.nombrePerfil}</span> : null}
                      </td>
                      <td>{c.banco ?? "—"}</td>
                      <td className="num right">{c.monto === null ? "—" : formatoGs(c.monto)}</td>
                      <td className="text-[12px] text-muted">{c.problemas ?? c.caption ?? "—"}</td>
                      <td>
                        <FormularioAsignarComprobante comprobanteId={c.id} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </section>
    </div>
  );
}
