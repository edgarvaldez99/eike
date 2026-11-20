import { requerirSesion } from "@/lib/auth/guardas";
import { Card } from "@/componentes/ui/Card";
import { FormularioAliasBancario } from "@/componentes/cuenta/FormularioAliasBancario";
import { FormularioCorreoReenvioBanco } from "@/componentes/cuenta/FormularioCorreoReenvioBanco";

export const metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Configuración del método de pago (transferencia bancaria) — solo superadmin. */
export default async function PaginaPagos() {
  const usuario = await requerirSesion(["superadmin"]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-extrabold">Método de pago: transferencia bancaria</h2>
        <p className="mt-1 text-[13px] text-muted">
          Lo que cargues acá es lo que ve el comprador en el checkout. Sin alias cargado, la transferencia
          figura como no disponible.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div>
          <h3 className="mb-3 text-[15px] font-extrabold">Alias bancario para cobros</h3>
          <Card>
            <FormularioAliasBancario
              key={usuario.aliasBancarioValor ?? "sin-alias"}
              tipoActual={usuario.aliasBancarioTipo}
              valorActual={usuario.aliasBancarioValor}
            />
          </Card>
        </div>

        <div>
          <h3 className="mb-3 text-[15px] font-extrabold">Correo para los avisos del banco</h3>
          <Card>
            <FormularioCorreoReenvioBanco
              key={usuario.correoReenvioBanco ?? "sin-correo"}
              valorActual={usuario.correoReenvioBanco}
            />
          </Card>
        </div>
      </div>
    </div>
  );
}
