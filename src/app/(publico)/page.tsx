import Link from "next/link";
import type { Metadata } from "next";
import { obtenerEventosPublicos } from "@/server/eventos";
import { TarjetaEvento } from "@/componentes/publico/TarjetaEvento";
import { Icono } from "@/componentes/ui/Icono";

export const revalidate = 300;

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default async function Home() {
  const eventos = await obtenerEventosPublicos();
  const destacados = eventos.slice(0, 8);

  return (
    <div className="flex flex-col gap-8">
      <section className="py-6">
        <h1 className="text-3xl font-extrabold sm:text-4xl">
          <span className="text-amarillo-texto">Comprá. Mostrá el QR.</span>
          <br />
          Entrá, <span className="text-lila-bright">¡eike!</span>
        </h1>
        <p className="mt-3 max-w-lg text-muted">
          Comprá tu ticket con QR en minutos. Sin filas, sin sorpresas: el precio que ves es el que pagás.
        </p>
        <ol className="mt-6 flex max-w-2xl flex-col gap-3 sm:flex-row sm:gap-10">
          {["Elegís tu evento", "Pagás el precio exacto", "Entrás con tu QR"].map((paso, i) => (
            <li key={paso} className="flex items-center gap-2.5">
              <span className="border-lila-bright text-lila-bright flex h-7 w-7 flex-none items-center justify-center rounded-full border text-[13px] font-bold">
                {i + 1}
              </span>
              <span className="text-[13.5px]">{paso}</span>
            </li>
          ))}
        </ol>
      </section>

      {/* Placeholder decorativo — sin foto real todavía (ver plan, Fase 7).
          Patrón de cuadraditos lila/amarillo sobre un gradiente oscuro,
          mismo lenguaje visual que el ícono de marca (src/app/icon.png). */}
      <section
        aria-hidden="true"
        className="eike-full-bleed relative flex aspect-[21/9] items-center justify-center overflow-hidden sm:aspect-[3/1]"
        style={{
          background:
            "linear-gradient(135deg, var(--color-lila) 0%, var(--color-bg) 55%, var(--color-bg) 100%)",
        }}
      >
        <div
          className="absolute inset-0 opacity-25"
          style={{
            backgroundImage:
              "repeating-linear-gradient(45deg, var(--color-amarillo) 0 10px, transparent 10px 20px)," +
              "repeating-linear-gradient(-45deg, var(--color-lila-bright) 0 10px, transparent 10px 20px)",
            backgroundSize: "40px 40px",
          }}
        />
        <span className="eike-eyebrow relative text-[12px] sm:text-[14px]">Próximos eventos destacados</span>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-extrabold">Próximos eventos</h2>
          <span className="text-[13px] text-muted">Asunción y todo Paraguay</span>
          {eventos.length > destacados.length ? (
            <Link href="/eventos" className="inline-flex items-center gap-1 text-[13px] text-lila-bright underline">
              Ver todos <Icono nombre="flecha" />
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
