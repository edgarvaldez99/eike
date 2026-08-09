import { requerirSesion } from "@/lib/auth/guardas";

export default async function LayoutOrganizador({ children }: { children: React.ReactNode }) {
  // Superadmin entra acá también: ve y gestiona los eventos de todos (ver
  // docs/05, "Matriz de permisos" — no hay restricción de dueño para él).
  await requerirSesion(["organizador", "superadmin"]);
  return <>{children}</>;
}
