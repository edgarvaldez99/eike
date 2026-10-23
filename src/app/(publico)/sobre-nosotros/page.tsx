import type { Metadata } from "next";

export const metadata: Metadata = { title: "Sobre nosotros", robots: { index: false, follow: false } };

export default function PaginaSobreNosotros() {
  return (
    <div className="mx-auto max-w-lg py-12 text-center">
      <h1 className="text-2xl font-extrabold">Sobre nosotros</h1>
      <p className="mt-3 text-muted">Esta página todavía no tiene contenido — próximamente.</p>
    </div>
  );
}
