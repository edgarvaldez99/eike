import Image from "next/image";
import Link from "next/link";
import iconoMarca from "@/app/icon.png";
import { obtenerInvitacionVigente } from "@/server/staff";
import { Card } from "@/componentes/ui/Card";
import { AvisoError } from "@/componentes/ui/AvisoError";
import { FormularioAceptarInvitacion } from "@/componentes/organizador/FormularioAceptarInvitacion";

export const metadata = { title: "Invitación de staff", robots: { index: false, follow: false } };

export default async function PaginaAceptarInvitacion({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  let invitacion: Awaited<ReturnType<typeof obtenerInvitacionVigente>> | null = null;
  let error: string | null = null;
  try {
    invitacion = await obtenerInvitacionVigente(token);
  } catch (e) {
    error = e instanceof Error ? e.message : "Invitación inválida.";
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col justify-center gap-6 py-12">
      <div className="text-center">
        <Link href="/" className="mx-auto block w-fit">
          <Image src={iconoMarca} alt="" className="eike-brand-mark" />
        </Link>
        <h1 className="mt-3 text-xl font-extrabold">Invitación de staff</h1>
        {invitacion ? (
          <p className="mt-1 text-sm text-muted">
            {invitacion.organizadorNombre} te invitó como staff de{" "}
            <span className="font-semibold text-text">{invitacion.eventoNombre}</span>.
          </p>
        ) : null}
      </div>
      <Card>
        {invitacion ? (
          <FormularioAceptarInvitacion token={token} />
        ) : (
          <AvisoError mensaje={error ?? undefined} className="text-center" />
        )}
      </Card>
    </div>
  );
}
