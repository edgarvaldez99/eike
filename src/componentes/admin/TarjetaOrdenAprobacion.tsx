import type { OrdenParaAprobar } from "@/server/aprobaciones-admin";
import { Card } from "@/componentes/ui/Card";
import { Icono } from "@/componentes/ui/Icono";
import { Pill } from "@/componentes/ui/Pill";
import { BotonesAprobacion } from "@/componentes/organizador/BotonesAprobacion";
import { fechaAvisoAIso } from "@/lib/fecha-aviso";
import { ETIQUETA_COINCIDENCIA, FilaAvisoBanco } from "@/componentes/admin/FilaAvisoBanco";
import { CandidatosCorreoBanco } from "@/componentes/admin/CandidatosCorreoBanco";
import { formatoFecha, formatoGs, formatoVenceEn, linkWhatsapp } from "@/lib/formato";

const ETIQUETA_ESTADO_COMPROBANTE: Record<string, string> = {
  pendiente_banco: "esperando el correo del banco",
  confirmado: "confirmado con el banco",
  observado: "observado: revisar",
  duplicado: "duplicado",
  sin_datos: "el OCR no pudo leer el monto",
};

/** Tarjeta de una compra para el backoffice de aprobaciones del superadmin. */
export function TarjetaOrdenAprobacion({ orden, conAcciones = false }: { orden: OrdenParaAprobar; conAcciones?: boolean }) {
  const vence = conAcciones ? formatoVenceEn(orden.reservadoHasta) : null;
  const hayDobleCheck = orden.comprobantesWa.some((c) => c.estado === "confirmado");
  const mensajeComprador = `Hola ${orden.nombreComprador}, te escribimos de Eike por tu compra ${orden.codigo}.`;

  return (
    <Card>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[13px] font-bold">{orden.codigo}</span>
            {orden.estado === "pagada" ? <Pill variante="ok">Aprobada</Pill> : null}
            {orden.estado === "rechazada" ? <Pill variante="err">Rechazada</Pill> : null}
            {hayDobleCheck ? <Pill variante="ok">Doble check: comprobante + banco</Pill> : null}
          </div>
          <p className="text-[15px] font-extrabold">
            {orden.eventoNombre} · {formatoGs(orden.total)}
            <span className="ml-2 text-[12.5px] font-normal text-muted">
              {orden.cantidadTickets} {orden.cantidadTickets === 1 ? "entrada" : "entradas"}
            </span>
          </p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
            <dt className="text-muted">Comprador</dt>
            <dd>{orden.nombreComprador}</dd>
            <dt className="text-muted">Cédula</dt>
            <dd className="num">{orden.cedula ?? "—"}</dd>
            <dt className="text-muted">Email</dt>
            <dd className="break-all">{orden.email}</dd>
            <dt className="text-muted">Teléfono</dt>
            <dd>
              {orden.contacto ? (
                <a
                  href={linkWhatsapp(orden.contacto, mensajeComprador)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-lila-bright underline"
                >
                  <Icono nombre="whatsapp" /> {orden.contacto}
                </a>
              ) : (
                "—"
              )}
            </dd>
            <dt className="text-muted">Nº comprobante</dt>
            <dd className="num">{orden.comprobanteTexto ?? "—"}</dd>
            <dt className="text-muted">Organizador</dt>
            <dd>{orden.organizadorNombre}</dd>
            <dt className="text-muted">Comprado</dt>
            <dd className="num">
              {formatoFecha(orden.fechaCompra)}
              {vence ? <span className="ml-2 text-[11.5px] text-amarillo-texto">{vence}</span> : null}
            </dd>
          </dl>

          {orden.comprobantesWa.length > 0 ? (
            <div className="text-[12.5px]">
              <p className="font-bold">Lo que leyó el OCR del comprobante</p>
              <ul className="mt-1 flex flex-col gap-1 text-muted">
                {orden.comprobantesWa.map((c) => (
                  <li key={c.id}>
                    {c.origen === "carrito" ? "Foto subida en el checkout" : `WhatsApp ${c.waFrom}`} ·{" "}
                    {c.banco ?? "banco no reconocido"} · {c.monto === null ? "monto no leído" : formatoGs(c.monto)} ·{" "}
                    {ETIQUETA_ESTADO_COMPROBANTE[c.estado] ?? c.estado}
                    {c.nroComprobante ? ` · Nº ${c.nroComprobante}` : ""}
                    {c.cuentaDestino ? ` · cuenta ${c.cuentaDestino}` : ""}
                    {c.fecha ? ` · ${c.fecha}` : ""}
                    {c.coincidenciasRegistradas.length > 0 ? (
                      <span className="block text-green">
                        Coincidió con el correo del banco:{" "}
                        {c.coincidenciasRegistradas.map((x) => ETIQUETA_COINCIDENCIA[x as keyof typeof ETIQUETA_COINCIDENCIA] ?? x).join(", ")}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <CorreoBanco orden={orden} />
        </div>

        <div className="flex shrink-0 flex-col gap-3 lg:w-[280px]">
          {orden.comprobanteTipo === "imagen" ? (
            <a href={`/api/comprobantes/${orden.id}`} target="_blank" rel="noopener noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element -- comprobante privado servido por una ruta autenticada, no admite next/image */}
              <img
                src={`/api/comprobantes/${orden.id}`}
                alt={`Comprobante de pago de ${orden.nombreComprador}`}
                loading="lazy"
                className="max-h-[320px] w-full rounded-[var(--radius-eike-sm)] border border-border object-contain"
              />
            </a>
          ) : null}
          {orden.comprobanteTipo ? (
            <a
              href={`/api/comprobantes/${orden.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[12.5px] text-lila-bright underline"
            >
              {orden.comprobanteTipo === "pdf" ? "Abrir comprobante (PDF)" : "Abrir en tamaño completo"}{" "}
              <Icono nombre="flecha" direccion="arriba-derecha" />
            </a>
          ) : (
            <p className="text-[12.5px] text-muted">Esta compra no tiene comprobante adjunto.</p>
          )}
          {conAcciones ? <BotonesAprobacion ordenId={orden.id} /> : null}
        </div>
      </div>
    </Card>
  );
}

/**
 * Correo del banco para cotejar contra el comprobante. Si el aviso ya quedó atado
 * a la orden se muestra como "asociado"; si no, se listan los que llegaron sin
 * cruzar por el MISMO monto, para que el superadmin decida a ojo.
 */
function CorreoBanco({ orden }: { orden: OrdenParaAprobar }) {
  const hayComprobanteWa = orden.comprobantesWa.length > 0;
  const asociados = orden.avisosBanco;
  const candidatos = orden.estado === "pendiente" ? orden.avisosCandidatos : [];

  return (
    <div className="flex flex-col gap-2 text-[12.5px]">
      <p className="font-bold">Correo del banco</p>
      {asociados.length > 0 ? (
        <>
          <p className="text-green">Asociado a esta compra</p>
          {asociados.map((a) => (
            <FilaAvisoBanco key={a.id} aviso={a} hayComprobanteWa={hayComprobanteWa} />
          ))}
        </>
      ) : null}
      {candidatos.length > 0 ? (
        <>
          <p className="text-amarillo-texto">
            {asociados.length > 0 ? "Otros avisos" : "Avisos"} recientes sin asociar a ninguna compra — buscá el que
            corresponda al comprobante (monto, cuenta, fecha y hora)
          </p>
          <CandidatosCorreoBanco
            candidatos={candidatos}
            totalOrden={orden.total}
            hayComprobanteWa={hayComprobanteWa}
            desdeInicial={fechaAvisoAIso(orden.comprobantesWa.find((c) => c.fecha)?.fecha ?? null)}
          />
        </>
      ) : null}
      {asociados.length === 0 && candidatos.length === 0 ? (
        <p className="text-muted">
          {orden.estado === "pendiente"
            ? "Todavía no llegó ningún correo del banco en los últimos días."
            : "No hay correo del banco asociado a esta compra."}
        </p>
      ) : null}
    </div>
  );
}
