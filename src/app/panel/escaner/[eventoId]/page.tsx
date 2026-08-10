import { notFound } from "next/navigation";
import { puedeEscanearEvento, requerirSesion } from "@/lib/auth/guardas";
import { db } from "@/db/cliente";
import { eventos } from "@/db/esquema";
import { eq } from "drizzle-orm";
import { EscanerCamara } from "@/componentes/escaner/EscanerCamara";

export const metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function PaginaEscaner({
  params,
}: {
  params: Promise<{ eventoId: string }>;
}) {
  const usuario = await requerirSesion(["superadmin", "organizador", "staff"]);
  const { eventoId } = await params;
  const id = Number(eventoId);
  if (!Number.isInteger(id)) notFound();

  const [evento] = await db.select().from(eventos).where(eq(eventos.id, id)).limit(1);
  if (!evento) notFound();
  if (!(await puedeEscanearEvento(id, usuario))) notFound();

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-6">
      <div>
        <span className="eike-eyebrow">Escáner</span>
        <h1 className="mt-1 text-xl font-extrabold">{evento.nombre}</h1>
      </div>
      <EscanerCamara eventoId={id} />
    </main>
  );
}
