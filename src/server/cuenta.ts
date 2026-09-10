import { eq } from "drizzle-orm";
import { db } from "@/db/cliente";
import { usuarios } from "@/db/esquema";
import { ErrorNegocio } from "@/lib/errores";
import { hashearPassword, verificarPassword } from "@/lib/auth/password";
import type { TipoAliasBancario } from "@/lib/constantes";

/**
 * Autoedición de perfil — cualquier usuario logueado edita SUS PROPIOS
 * datos (la action layer, lib/acciones/cuenta.ts, no exige ningún rol
 * puntual, solo sesión). No valida el email a mano contra duplicados: el
 * índice uq_usuarios_email_lower ya lo hace, y errores-pg.ts ya mapea esa
 * violación a "Ya existe una cuenta con ese email." — mismo criterio que
 * registrarComprador.
 */
export interface DatosEditarPerfil {
  nombre: string;
  email: string;
  telefono: string | null;
  cedula: string | null;
}

export async function editarPerfilPropio(usuarioId: number, datos: DatosEditarPerfil): Promise<void> {
  await db.update(usuarios).set(datos).where(eq(usuarios.id, usuarioId));
}

/** Exige la contraseña ACTUAL antes de cambiarla — evita que una sesión
 * abierta sin vigilancia (o un CSRF/XSS chico) cambie la contraseña sin que
 * quien esté al teclado en verdad la sepa. */
export async function cambiarPasswordPropio(
  usuarioId: number,
  passwordActual: string,
  passwordNueva: string,
): Promise<void> {
  const [fila] = await db
    .select({ passwordHash: usuarios.passwordHash })
    .from(usuarios)
    .where(eq(usuarios.id, usuarioId))
    .limit(1);
  if (!fila) throw new ErrorNegocio("Usuario no encontrado.");
  if (!(await verificarPassword(passwordActual, fila.passwordHash))) {
    throw new ErrorNegocio("La contraseña actual no es correcta.");
  }

  const passwordHash = await hashearPassword(passwordNueva);
  await db.update(usuarios).set({ passwordHash }).where(eq(usuarios.id, usuarioId));
}

export interface DatosAliasBancario {
  tipo: TipoAliasBancario;
  valor: string;
}

/**
 * Alias bancario del superadmin — dato de LA PLATAFORMA, no de cada
 * organizador (decisión explícita): se usa para el mensaje de WhatsApp con
 * las instrucciones de pago, nunca se muestra en el checkout. La action
 * layer ya restringe el rol a superadmin; acá no hace falta validar de
 * nuevo porque no hay ninguna regla de negocio adicional que lo exija.
 */
export async function editarAliasBancario(usuarioId: number, datos: DatosAliasBancario): Promise<void> {
  await db
    .update(usuarios)
    .set({ aliasBancarioTipo: datos.tipo, aliasBancarioValor: datos.valor })
    .where(eq(usuarios.id, usuarioId));
}
