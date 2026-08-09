import { Card } from "@/componentes/ui/Card";
import { Metrica } from "@/componentes/ui/Metrica";
import { Pill } from "@/componentes/ui/Pill";

/**
 * Home temporal de la Fase 0 — solo para verificar que los tokens de diseño
 * (bg/surface/cyan/amber/green del artifact) y las primitivas UI compilan y
 * se ven bien. Se reemplaza por la landing real en la Fase 5 (storefront).
 */
export default function Home() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-8">
      <div>
        <span className="eike-eyebrow">Eike · Fase 0</span>
        <h1 className="mt-1 text-2xl font-extrabold">Cimientos del proyecto</h1>
        <p className="mt-1 text-sm text-muted">
          Next.js + Tailwind v4 con los tokens del artifact aprobado.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metrica etiqueta="Total ventas" valor="₲3.070.000" sub="Datos de prueba" />
        <Metrica etiqueta="Tickets vendidos" valor={19} sub="de 700 en aforo" acento />
        <Metrica etiqueta="Ventas de hoy" valor="₲0" sub="0 tickets" />
        <Metrica etiqueta="Proyección" valor="₲0" sub="≈ 0 tickets" />
      </div>

      <Card className="flex flex-wrap items-center gap-2">
        <Pill variante="ok">Activo</Pill>
        <Pill variante="warn">Invitado</Pill>
        <Pill variante="err">Expiró</Pill>
        <Pill variante="info">Notificado</Pill>
        <Pill variante="neutral">Borrador</Pill>
      </Card>
    </main>
  );
}
