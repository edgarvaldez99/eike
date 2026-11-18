import type { OrdenParaAprobar } from "@/server/aprobaciones-admin";
import { Card } from "@/componentes/ui/Card";
import { Pill } from "@/componentes/ui/Pill";
import { TarjetaOrdenAprobacion } from "@/componentes/admin/TarjetaOrdenAprobacion";
import { formatoGs } from "@/lib/formato";

interface GrupoEvento {
  eventoId: number;
  eventoNombre: string;
  ordenes: OrdenParaAprobar[];
}

function agruparPorEvento(ordenes: OrdenParaAprobar[]): GrupoEvento[] {
  const grupos = new Map<number, GrupoEvento>();
  for (const orden of ordenes) {
    const grupo = grupos.get(orden.eventoId) ?? {
      eventoId: orden.eventoId,
      eventoNombre: orden.eventoNombre,
      ordenes: [],
    };
    grupo.ordenes.push(orden);
    grupos.set(orden.eventoId, grupo);
  }
  return [...grupos.values()];
}

/**
 * Compras agrupadas por evento en acordeones (<details> nativo: accesible por
 * teclado, sin JS y compatible con server components). El orden de los grupos
 * sigue al de la primera compra de cada uno — en la cola de pendientes, el
 * evento con la compra más vieja queda arriba.
 *
 * `abiertos` abre todos los grupos de entrada (útil con pocos eventos); si no,
 * arrancan cerrados y el resumen del encabezado alcanza para decidir cuál abrir.
 */
export function ComprasPorEvento({
  ordenes,
  conAcciones = false,
  abiertos = false,
  vacio,
}: {
  ordenes: OrdenParaAprobar[];
  conAcciones?: boolean;
  abiertos?: boolean;
  vacio: string;
}) {
  if (ordenes.length === 0) {
    return (
      <Card>
        <p className="text-center text-muted">{vacio}</p>
      </Card>
    );
  }

  const grupos = agruparPorEvento(ordenes);

  return (
    <div className="flex flex-col gap-3">
      {grupos.map((grupo) => {
        const total = grupo.ordenes.reduce((suma, o) => suma + o.total, 0);
        const entradas = grupo.ordenes.reduce((suma, o) => suma + o.cantidadTickets, 0);
        return (
          <details key={grupo.eventoId} open={abiertos} className="eike-acordeon eike-card">
            <summary className="eike-acordeon-resumen">
              <span className="min-w-0 flex-1 truncate text-[15px] font-extrabold">{grupo.eventoNombre}</span>
              <span className="flex shrink-0 items-center gap-2 text-[12.5px] text-muted">
                <Pill variante={conAcciones ? "warn" : "neutral"}>
                  {grupo.ordenes.length} {grupo.ordenes.length === 1 ? "compra" : "compras"}
                </Pill>
                <span className="hidden sm:inline">
                  {entradas} {entradas === 1 ? "entrada" : "entradas"} · {formatoGs(total)}
                </span>
              </span>
            </summary>
            <div className="flex flex-col gap-3 border-t border-border-soft p-3">
              {grupo.ordenes.map((orden) => (
                <TarjetaOrdenAprobacion key={orden.id} orden={orden} conAcciones={conAcciones} />
              ))}
            </div>
          </details>
        );
      })}
    </div>
  );
}
