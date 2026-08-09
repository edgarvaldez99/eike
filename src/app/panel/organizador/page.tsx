import { requerirSesion } from "@/lib/auth/guardas";
import { obtenerMisEventos } from "@/server/eventos";
import { EventoCard } from "@/componentes/organizador/EventoCard";
import { ModalNuevoEvento } from "@/componentes/organizador/ModalNuevoEvento";

export const metadata = { robots: { index: false, follow: false } };

export default async function PaginaMisEventos() {
  const usuario = await requerirSesion(["organizador", "superadmin"]);
  const eventos = await obtenerMisEventos(usuario);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className="eike-eyebrow">Panel organizador</span>
          <h1 className="mt-1 text-2xl font-extrabold">Mis eventos</h1>
        </div>
        <ModalNuevoEvento />
      </div>

      {eventos.length === 0 ? (
        <div className="eike-card border-dashed p-8 text-center text-muted">
          <p>Todavía no creaste ningún evento.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {eventos.map((evento) => (
            <EventoCard key={evento.id} evento={evento} />
          ))}
        </div>
      )}
    </div>
  );
}
