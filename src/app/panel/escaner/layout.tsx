import { requerirSesion } from "@/lib/auth/guardas";

export default async function LayoutEscaner({ children }: { children: React.ReactNode }) {
  await requerirSesion(["superadmin", "organizador", "staff"]);
  return <>{children}</>;
}
