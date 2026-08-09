import { requerirSesion } from "@/lib/auth/guardas";
import { Card } from "@/componentes/ui/Card";

export const metadata = { robots: { index: false, follow: false } };

export default async function PaginaPanelResumen() {
  const usuario = await requerirSesion();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <span className="eike-eyebrow">Panel</span>
        <h1 className="mt-1 text-2xl font-extrabold">Hola, {usuario.nombre.split(" ")[0]}</h1>
        <p className="mt-1 text-sm text-muted">
          Fase 2 — sesión real contra Postgres, protegida por rol. El dashboard de
          verdad (KPIs, gráfico de ventas) llega en la Fase 4.
        </p>
      </div>
      <Card>
        <p className="text-sm text-muted">
          Sesión activa como <span className="text-text font-semibold">{usuario.email}</span>.
        </p>
      </Card>
    </div>
  );
}
