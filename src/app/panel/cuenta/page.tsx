import { requerirSesion } from "@/lib/auth/guardas";
import { obtenerOCrearCodigoReferido } from "@/server/referidos";
import { Card } from "@/componentes/ui/Card";
import { Pill } from "@/componentes/ui/Pill";
import { CodigoReferido } from "@/componentes/cuenta/CodigoReferido";
import { FormularioEditarPerfil } from "@/componentes/cuenta/FormularioEditarPerfil";
import { FormularioCambiarPassword } from "@/componentes/cuenta/FormularioCambiarPassword";
import { FormularioAliasBancario } from "@/componentes/cuenta/FormularioAliasBancario";
import { formatoFecha } from "@/lib/formato";

export const metadata = { robots: { index: false, follow: false } };

const PILL_POR_ESTADO: Record<string, "ok" | "warn" | "err" | "neutral"> = {
  activo: "ok",
  pendiente_aprobacion: "warn",
  mora: "warn",
  rechazado: "err",
  inactivo: "neutral",
};

const ETIQUETA_ROL: Record<string, string> = {
  superadmin: "Superadmin",
  organizador: "Organizador",
  staff: "Staff",
  comprador: "Comprador",
};

export default async function PaginaCuenta() {
  const usuario = await requerirSesion();
  // Perezoso: se genera recién la primera vez que alguien entra acá.
  const codigoReferido = usuario.codigoReferido ?? (await obtenerOCrearCodigoReferido(usuario.id));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <span className="eike-eyebrow">Panel</span>
        <h1 className="mt-1 text-2xl font-extrabold">Mi cuenta</h1>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div>
          <h2 className="mb-3 text-[15px] font-extrabold">Mis datos</h2>
          <Card>
            <div className="mb-4 flex flex-wrap items-center gap-3 text-[13px]">
              <span className="text-muted">Rol: {ETIQUETA_ROL[usuario.rol] ?? usuario.rol}</span>
              <Pill variante={PILL_POR_ESTADO[usuario.estado] ?? "neutral"}>{usuario.estado}</Pill>
              <span className="text-muted">Cuenta creada: {formatoFecha(usuario.creadoEn)}</span>
            </div>
            <FormularioEditarPerfil
              perfil={{
                nombre: usuario.nombre,
                email: usuario.email,
                telefono: usuario.telefono,
                cedula: usuario.cedula,
              }}
            />
          </Card>
        </div>

        <div>
          <h2 className="mb-3 text-[15px] font-extrabold">Cambiar contraseña</h2>
          <Card>
            <FormularioCambiarPassword />
          </Card>
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-[15px] font-extrabold">Tu código de vendedor</h2>
        <Card>
          <CodigoReferido codigo={codigoReferido} />
        </Card>
      </div>

      {usuario.rol === "superadmin" ? (
        <div>
          <h2 className="mb-3 text-[15px] font-extrabold">Alias bancario para cobros</h2>
          <Card>
            <FormularioAliasBancario
              key={usuario.aliasBancarioValor ?? "sin-alias"}
              tipoActual={usuario.aliasBancarioTipo}
              valorActual={usuario.aliasBancarioValor}
            />
          </Card>
        </div>
      ) : null}
    </div>
  );
}
