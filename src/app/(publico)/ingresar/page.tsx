import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import iconoMarca from "@/app/icon.png";
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
    <div className="mx-auto flex max-w-sm flex-col justify-center gap-6 py-12">
      <div className="text-center">
        <Link href="/" className="mx-auto block w-fit">
          <Image src={iconoMarca} alt="" className="eike-brand-mark" />
        </Link>
        <h1 className="mt-3 text-xl font-extrabold">Ingresar a Eike</h1>
        <p className="mt-1 text-sm text-muted">Organizadores, staff y superadmin.</p>
      </div>
      <Card>
        <FormularioLogin />
      </Card>
    </div>
  );
}
