import { cookies } from "next/headers";
import { getIronSession, type SessionOptions } from "iron-session";
import { cache } from "react";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/cliente";
import { usuarios } from "@/db/esquema";
import { MOTIVOS_BLOQUEO_LOGIN, type EstadoUsuario, type Rol } from "@/lib/constantes";
import { verificarPassword } from "./password";

/**
 * Sesión — puerto directo de api/auth.php a iron-session.
 *
 * El PHP guarda $_SESSION['usuario_id'] y ['rol'], pero en la práctica
 * usuarioActual() siempre re-consulta la fila completa por id (para que
 * inactivar/rechazar a alguien surta efecto al instante, sin esperar a que
 * expire nada). Acá replicamos exactamente eso: la cookie sellada SOLO
 * guarda usuarioId; el rol y el estado salen siempre de una lectura fresca
 * de la base, memoizada con cache() para no repetir el SELECT dentro del
 * mismo render cuando varios Server Components piden el usuario actual.
 */

interface DatosSesion {
  usuarioId?: number;
}

function leerSecreto(): string {
  const secreto = process.env.SESSION_SECRET;
  if (!secreto || secreto.length < 32) {
    throw new Error(
      "Falta SESSION_SECRET (o tiene menos de 32 caracteres) — ver .env.example.",
    );
  }
  return secreto;
}

const opcionesSesion: SessionOptions = {
  cookieName: "eike_sesion",
  password: leerSecreto(),
  // Igual que $config['sesion_duracion'] del PHP (config.php): 8 horas.
  ttl: 8 * 60 * 60,
  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  },
};

async function obtenerSesionCookie() {
  return getIronSession<DatosSesion>(await cookies(), opcionesSesion);
}

export type UsuarioSesion = {
  id: number;
  nombre: string;
  email: string;
  rol: Rol;
  telefono: string | null;
  cedula: string | null;
  estado: EstadoUsuario;
  creadoEn: Date;
};

const COLUMNAS_PUBLICAS = {
  id: usuarios.id,
  nombre: usuarios.nombre,
  email: usuarios.email,
  rol: usuarios.rol,
  telefono: usuarios.telefono,
  cedula: usuarios.cedula,
  estado: usuarios.estado,
  creadoEn: usuarios.creadoEn,
} as const;

/** Usuario logueado (sin password_hash), o null. Memoizado por request. */
export const usuarioActual = cache(async (): Promise<UsuarioSesion | null> => {
  const sesion = await obtenerSesionCookie();
  if (!sesion.usuarioId) return null;

  const [fila] = await db
    .select(COLUMNAS_PUBLICAS)
    .from(usuarios)
    .where(eq(usuarios.id, sesion.usuarioId))
    .limit(1);

  return (fila as UsuarioSesion) ?? null;
});

/**
 * Intenta iniciar sesión. Lanza un Error (mensaje ya listo para mostrar al
 * usuario) si las credenciales son inválidas o la cuenta está bloqueada.
 * Solo se puede llamar desde un Server Action o Route Handler (necesita
 * escribir la cookie).
 */
export async function iniciarSesion(email: string, password: string): Promise<UsuarioSesion> {
  // MariaDB compara emails sin distinguir mayúsculas; este lookup replica
  // esa semántica contra el índice uq_usuarios_email_lower (ver db/esquema.ts).
  const [fila] = await db
    .select()
    .from(usuarios)
    .where(sql`lower(${usuarios.email}) = lower(${email.trim()})`)
    .limit(1);

  if (!fila || !(await verificarPassword(password, fila.passwordHash))) {
    throw new Error("Email o contraseña incorrectos.");
  }

  const motivoBloqueo = MOTIVOS_BLOQUEO_LOGIN[fila.estado as EstadoUsuario];
  if (motivoBloqueo) {
    throw new Error(motivoBloqueo);
  }

  const sesion = await obtenerSesionCookie();
  sesion.usuarioId = fila.id;
  await sesion.save();

  const usuario: Record<string, unknown> = { ...fila };
  delete usuario.passwordHash;
  return usuario as UsuarioSesion;
}

export async function cerrarSesion(): Promise<void> {
  const sesion = await obtenerSesionCookie();
  sesion.destroy();
}
