import { cookies } from "next/headers";
import { getIronSession, type SessionOptions } from "iron-session";

/**
 * Identidad del carrito (Fase 6 del plan de mejoras) — una cookie sellada
 * con iron-session, reutilizando SESSION_SECRET (mismo patrón que
 * lib/auth/sesion.ts), NO un token crudo: aunque el token en sí ya tiene
 * suficiente entropía, sellarlo evita que alguien arme una cookie a mano
 * apuntando al carrito de otra persona.
 *
 * A propósito NO es la misma cookie que la sesión de usuario: el carrito
 * tiene que funcionar para un invitado sin cuenta, que es como se compra
 * hoy (ver comprarTicket) — nada de esto exige estar logueado.
 */

interface DatosCarritoCookie {
  token?: string;
}

function leerSecreto(): string {
  const secreto = process.env.SESSION_SECRET;
  if (!secreto || secreto.length < 32) {
    throw new Error("Falta SESSION_SECRET (o tiene menos de 32 caracteres) — ver .env.example.");
  }
  return secreto;
}

const opcionesCookie: SessionOptions = {
  cookieName: "eike_carrito",
  password: leerSecreto(),
  // Deliberadamente más larga que la vida real de un carrito (60 min como
  // techo, ver MINUTOS_CARRITO_MAXIMO): la cookie sobrevive de sobra a
  // cualquier carrito que referencie, así que un visitante que vuelve
  // semanas después simplemente no encuentra un carrito activo/vigente y
  // el próximo "agregar al carrito" le crea uno nuevo con normalidad.
  ttl: 90 * 24 * 60 * 60,
  cookieOptions: {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === "true",
    sameSite: "lax",
    path: "/",
  },
};

async function obtenerSesionCookieCarrito() {
  return getIronSession<DatosCarritoCookie>(await cookies(), opcionesCookie);
}

/** De solo lectura — se puede llamar desde un Server Component en render. */
export async function leerTokenCarrito(): Promise<string | null> {
  const sesion = await obtenerSesionCookieCarrito();
  return sesion.token ?? null;
}

/** Escribe la cookie — solo se puede llamar desde un Server Action o Route Handler. */
export async function escribirTokenCarrito(token: string): Promise<void> {
  const sesion = await obtenerSesionCookieCarrito();
  sesion.token = token;
  await sesion.save();
}
