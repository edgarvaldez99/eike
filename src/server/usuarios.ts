import { sql } from "drizzle-orm";
import { db } from "@/db/cliente";
import { usuarios } from "@/db/esquema";
import { ErrorNegocio } from "@/lib/errores";
import { hashearPassword } from "@/lib/auth/password";

export interface DatosRegistroComprador {
  nombre: string;
  email: string;
  password: string;
  telefono: string | null;
  cedula: string | null;
}

/** Puerto de usuarios.php?accion=registro_comprador — alta directa, sin aprobación. */
export async function registrarComprador(datos: DatosRegistroComprador): Promise<number> {
  const [existente] = await db
    .select({ id: usuarios.id })
    .from(usuarios)
    .where(sql`lower(${usuarios.email}) = lower(${datos.email})`)
    .limit(1);
  if (existente) {
    throw new ErrorNegocio("Ya existe una cuenta con ese email.");
  }

  const passwordHash = await hashearPassword(datos.password);
  const [creado] = await db
    .insert(usuarios)
    .values({
      nombre: datos.nombre,
      email: datos.email,
      passwordHash,
      rol: "comprador",
      telefono: datos.telefono,
      cedula: datos.cedula,
      estado: "activo",
      tycAceptadoEn: new Date(),
    })
    .returning({ id: usuarios.id });
  return creado.id;
}
