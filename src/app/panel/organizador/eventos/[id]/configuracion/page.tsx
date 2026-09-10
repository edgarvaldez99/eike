import { notFound } from "next/navigation";
import { requerirSesion } from "@/lib/auth/guardas";
import { obtenerEventoConTandas } from "@/server/eventos";
import { listarCuponesDelEvento } from "@/server/cupones";
import { listarProgramasDelEvento } from "@/server/referidos";
import { Card } from "@/componentes/ui/Card";
import { Pill } from "@/componentes/ui/Pill";
import { PILL_ESTADO_TANDA } from "@/lib/estilosEstado";
import { formatoFecha, formatoGs } from "@/lib/formato";
import { FormularioDatosEvento } from "@/componentes/organizador/FormularioDatosEvento";
import { FormularioAfiche } from "@/componentes/organizador/FormularioAfiche";
import { FormularioNuevaTanda } from "@/componentes/organizador/FormularioNuevaTanda";
import { BotonEliminarTanda } from "@/componentes/organizador/BotonEliminarTanda";
import { BotonVisibilidadTanda } from "@/componentes/organizador/BotonVisibilidadTanda";
import { FormularioNuevoCupon } from "@/componentes/organizador/FormularioNuevoCupon";
import { BotonVisibilidadCupon } from "@/componentes/organizador/BotonVisibilidadCupon";
import { FormularioNuevoPrograma } from "@/componentes/organizador/FormularioNuevoPrograma";
import { BotonVisibilidadPrograma } from "@/componentes/organizador/BotonVisibilidadPrograma";

export const metadata = { robots: { index: false, follow: false } };

const ETIQUETA_TIPO_TANDA: Record<string, string> = { general: "General", numerada: "Numerada" };
const ETIQUETA_ESTADO_TANDA: Record<string, string> = { activa: "Activa", agotada: "Agotada", inactiva: "Inactiva" };

function etiquetaValorCupon(cupon: { tipo: string; valor: number }): string {
  return cupon.tipo === "porcentaje" ? `${cupon.valor}%` : formatoGs(cupon.valor);
}

export default async function PaginaConfiguracionEvento({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requerirSesion(["organizador", "superadmin"]);
  const { id } = await params;
  const evento = await obtenerEventoConTandas(Number(id));
  if (!evento) notFound();
  const cupones = await listarCuponesDelEvento(evento.id, evento.organizadorId);
  const programas = await listarProgramasDelEvento(evento.id, evento.organizadorId);
  // Aprobación de eventos (anti-estafa): fuera de 'borrador'/'rechazado' el
  // evento es de solo lectura — mismo criterio que verificarEventoEditable
  // en el servidor. Acá se usa solo para no mostrar controles que el
  // servidor de todos modos va a rechazar.
  const puedeEditar = evento.estado === "borrador" || evento.estado === "rechazado";

  return (
    <div className="flex flex-col gap-6">
      {!puedeEditar ? (
        <div className="eike-card border-amber/40 bg-amber-dim p-4 text-[13.5px]">
          Este evento es de solo lectura
          {evento.estado === "pendiente_aprobacion" ? " mientras el superadmin lo revisa." : "."}
        </div>
      ) : null}

      <div>
        <h2 className="mb-3 text-[15px] font-extrabold">Datos del evento</h2>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_200px]">
          <Card>
            <FormularioDatosEvento evento={evento} />
          </Card>
          <Card>
            <FormularioAfiche eventoId={evento.id} aficheUrl={evento.aficheUrl} puedeEditar={puedeEditar} />
          </Card>
        </div>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] font-extrabold">Tandas</h2>
        </div>
        <Card className="mb-4 p-0">
          <div className="overflow-x-auto">
            <table className="eike-tabla">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Tipo</th>
                  <th className="right">Precio</th>
                  <th className="right">Vendidas / Total</th>
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {evento.tandas.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center text-muted">
                      Todavía no creaste ninguna tanda.
                    </td>
                  </tr>
                ) : (
                  evento.tandas.map((tanda) => (
                    <tr key={tanda.id}>
                      <td>{tanda.nombre}</td>
                      <td className="text-muted">{ETIQUETA_TIPO_TANDA[tanda.tipo]}</td>
                      <td className="num right">{formatoGs(tanda.precio)}</td>
                      <td className="num right">
                        {tanda.cantidadVendida} / {tanda.cantidadTotal}
                      </td>
                      <td>
                        <Pill variante={PILL_ESTADO_TANDA[tanda.estado]}>
                          {ETIQUETA_ESTADO_TANDA[tanda.estado]}
                        </Pill>
                      </td>
                      <td>
                        {puedeEditar ? (
                          <div className="flex items-center justify-end gap-2">
                            <BotonVisibilidadTanda tandaId={tanda.id} estado={tanda.estado} />
                            <BotonEliminarTanda tandaId={tanda.id} />
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
        {puedeEditar ? <FormularioNuevaTanda eventoId={evento.id} /> : null}
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] font-extrabold">Cupones de descuento</h2>
        </div>
        <Card className="mb-4 p-0">
          <div className="overflow-x-auto">
            <table className="eike-tabla">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Aplica a</th>
                  <th className="right">Descuento</th>
                  <th className="right">Usos</th>
                  <th>Vence</th>
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {cupones.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center text-muted">
                      Todavía no creaste ningún cupón.
                    </td>
                  </tr>
                ) : (
                  cupones.map((cupon) => (
                    <tr key={cupon.id}>
                      <td className="font-mono">{cupon.codigo}</td>
                      <td className="text-muted">{cupon.eventoId === null ? "Todos mis eventos" : "Este evento"}</td>
                      <td className="num right">{etiquetaValorCupon(cupon)}</td>
                      <td className="num right">
                        {cupon.usos}
                        {cupon.maxUsos !== null ? ` / ${cupon.maxUsos}` : ""}
                      </td>
                      <td className="num text-muted">{cupon.venceEn ? formatoFecha(cupon.venceEn) : "—"}</td>
                      <td>
                        <Pill variante={cupon.activo ? "ok" : "neutral"}>
                          {cupon.activo ? "Activo" : "Inactivo"}
                        </Pill>
                      </td>
                      <td>{puedeEditar ? <BotonVisibilidadCupon cuponId={cupon.id} activo={cupon.activo} /> : null}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
        {puedeEditar ? <FormularioNuevoCupon eventoId={evento.id} /> : null}
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] font-extrabold">Premios por compartir</h2>
        </div>
        <Card className="mb-4 p-0">
          <div className="overflow-x-auto">
            <table className="eike-tabla">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Aplica a</th>
                  <th className="right">Ventas por premio</th>
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {programas.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center text-muted">
                      Todavía no creaste ningún programa de referidos.
                    </td>
                  </tr>
                ) : (
                  programas.map((programa) => (
                    <tr key={programa.id}>
                      <td>{programa.nombre}</td>
                      <td className="text-muted">{programa.eventoId === null ? "Todos mis eventos" : "Este evento"}</td>
                      <td className="num right">{programa.ventasRequeridas}</td>
                      <td>
                        <Pill variante={programa.activo ? "ok" : "neutral"}>
                          {programa.activo ? "Activo" : "Inactivo"}
                        </Pill>
                      </td>
                      <td>
                        {puedeEditar ? (
                          <BotonVisibilidadPrograma programaId={programa.id} activo={programa.activo} />
                        ) : null}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
        {puedeEditar ? <FormularioNuevoPrograma eventoId={evento.id} tandas={evento.tandas} /> : null}
      </div>
    </div>
  );
}
