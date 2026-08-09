import type { Metadata } from "next";
import { obtenerEventosPublicos } from "@/server/eventos";
import { TarjetaEvento } from "@/componentes/publico/TarjetaEvento";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Eventos",
  description: "Todos los eventos publicados en Eike.",
  alternates: { canonical: "/eventos" },
};

export default async function PaginaEventos() {
  const eventos = await obtenerEventosPublicos();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-extrabold">Eventos</h1>
      {eventos.length === 0 ? (
        <div className="eike-card border-dashed p-8 text-center text-muted">
          No hay eventos publicados por el momento.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {eventos.map((evento) => (
            <TarjetaEvento key={evento.id} evento={evento} />
          ))}
        </div>
      )}
    </div>
  );
}
