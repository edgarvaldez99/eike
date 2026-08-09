import Link from "next/link";
import type { Metadata } from "next";
import { obtenerEventosPublicos } from "@/server/eventos";
import { TarjetaEvento } from "@/componentes/publico/TarjetaEvento";

export const revalidate = 300;

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default async function Home() {
  const eventos = await obtenerEventosPublicos();
  const destacados = eventos.slice(0, 8);

  return (
    <div className="flex flex-col gap-8">
      <section className="py-6 text-center">
        <h1 className="text-3xl font-extrabold sm:text-4xl">Entradas para eventos en Paraguay</h1>
        <p className="mx-auto mt-3 max-w-lg text-muted">
          Comprá tu ticket con QR en minutos. Sin filas, sin sorpresas: el precio que ves es el que pagás.
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-extrabold">Próximos eventos</h2>
          {eventos.length > destacados.length ? (
            <Link href="/eventos" className="text-[13px] text-cyan hover:underline">
              Ver todos →
            </Link>
          ) : null}
        </div>

        {destacados.length === 0 ? (
          <div className="eike-card border-dashed p-8 text-center text-muted">
            No hay eventos publicados por el momento.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {destacados.map((evento) => (
              <TarjetaEvento key={evento.id} evento={evento} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
