import { redirect } from "next/navigation";
import { usuarioActual } from "@/lib/auth/sesion";
import { Card } from "@/componentes/ui/Card";
import { FormularioLogin } from "@/componentes/auth/FormularioLogin";

export const metadata = {
  title: "Ingresar",
  robots: { index: false, follow: false },
};

export default async function PaginaIngresar() {
  const usuario = await usuarioActual();
  if (usuario) {
    redirect("/panel");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-8">
      <div className="text-center">
        <div className="eike-brand-mark mx-auto">e</div>
        <h1 className="mt-3 text-xl font-extrabold">Ingresar a Eike</h1>
        <p className="mt-1 text-sm text-muted">Organizadores, staff y superadmin.</p>
      </div>
      <Card>
        <FormularioLogin />
      </Card>
    </main>
  );
}
