import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { usuarioActual } from "@/lib/auth/sesion";
import { rutaInternaSegura } from "@/lib/rutas";
import { Card } from "@/componentes/ui/Card";
import { FormularioRegistroComprador } from "@/componentes/publico/FormularioRegistroComprador";

export const metadata: Metadata = { title: "Crear cuenta", robots: { index: false, follow: false } };

export default async function PaginaRegistrarme({
  searchParams,
}: {
  searchParams: Promise<{ volver?: string }>;
}) {
  const usuario = await usuarioActual();
  if (usuario) redirect("/panel/mis-entradas");

  const { volver } = await searchParams;

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6">
      <div className="text-center">
        <h1 className="text-xl font-extrabold">Crear cuenta</h1>
        <p className="mt-1 text-sm text-muted">
          Con cuenta reimprimís tu QR cuando quieras y elegís tu asiento en tandas numeradas.
        </p>
      </div>
      <Card>
        <FormularioRegistroComprador volver={rutaInternaSegura(volver)} />
      </Card>
    </div>
  );
}
