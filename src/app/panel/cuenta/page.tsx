import { requerirSesion } from "@/lib/auth/guardas";
import { Card } from "@/componentes/ui/Card";
import { Pill } from "@/componentes/ui/Pill";
import { formatoFecha } from "@/lib/formato";

export const metadata = { robots: { index: false, follow: false } };

const PILL_POR_ESTADO: Record<string, "ok" | "warn" | "err" | "neutral"> = {
  activo: "ok",
  pendiente_aprobacion: "warn",
  mora: "warn",
  rechazado: "err",
  inactivo: "neutral",
};

export default async function PaginaCuenta() {
  const usuario = await requerirSesion();

  const filas: [string, React.ReactNode][] = [
    ["Nombre", usuario.nombre],
    ["Email", usuario.email],
    ["Rol", usuario.rol],
    ["Estado", <Pill key="estado" variante={PILL_POR_ESTADO[usuario.estado] ?? "neutral"}>{usuario.estado}</Pill>],
    ["Teléfono", usuario.telefono ?? "—"],
    ["Cédula", usuario.cedula ?? "—"],
    ["Cuenta creada", formatoFecha(usuario.creadoEn)],
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <span className="eike-eyebrow">Panel</span>
        <h1 className="mt-1 text-2xl font-extrabold">Mi cuenta</h1>
      </div>
      <Card className="p-0">
        <table className="eike-tabla">
          <tbody>
            {filas.map(([etiqueta, valor]) => (
              <tr key={etiqueta}>
                <td className="text-muted">{etiqueta}</td>
                <td>{valor}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
