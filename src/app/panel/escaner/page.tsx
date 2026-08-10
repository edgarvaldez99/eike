import Link from "next/link";
import { requerirSesion } from "@/lib/auth/guardas";
import { obtenerEventosEscaneables } from "@/server/escaner";
import { Card } from "@/componentes/ui/Card";
import { formatoFecha } from "@/lib/formato";

export const metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function PaginaSeleccionEscaner() {
  const usuario = await requerirSesion(["superadmin", "organizador", "staff"]);
  const eventos = await obtenerEventosEscaneables(usuario);

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-6">
      <div>
        <span className="eike-eyebrow">Escáner</span>
        <h1 className="mt-1 text-xl font-extrabold">Elegí el evento</h1>
      </div>
      {eventos.length === 0 ? (
        <div className="eike-card border-dashed p-6 text-center text-muted">
          No tenés eventos disponibles para escanear.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {eventos.map((e) => (
            <Link key={e.id} href={`/panel/escaner/${e.id}`}>
              <Card className="transition-colors hover:border-cyan">
                <div className="font-bold">{e.nombre}</div>
                <div className="text-[13px] text-muted">
                  {formatoFecha(e.fechaEvento)}
                  {e.lugar ? ` · ${e.lugar}` : ""}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
