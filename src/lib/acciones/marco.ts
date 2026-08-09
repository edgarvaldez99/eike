import { z } from "zod";
import { ErrorAutorizacion, requerirSesionAccion } from "@/lib/auth/guardas";
import type { UsuarioSesion } from "@/lib/auth/sesion";
import type { Rol } from "@/lib/constantes";
import { ErrorNegocio } from "@/lib/errores";
import { mensajeAmigablePg } from "@/lib/errores-pg";

export type ResultadoAccion<T = undefined> =
  | { ok: true; datos: T }
  | { ok: false; error: string; campos?: Record<string, string> };

/** Convierte un FormData (lo que manda un <form action={...}>) a un objeto plano para Zod. */
function formDataAObjeto(fd: FormData): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  for (const [clave, valor] of fd.entries()) {
    if (clave in obj) {
      const existente = obj[clave];
      obj[clave] = Array.isArray(existente) ? [...existente, valor] : [existente, valor];
    } else {
      obj[clave] = valor;
    }
  }
  return obj;
}

/** next/navigation redirect()/notFound() lanzan un error interno que hay que dejar pasar tal cual. */
function esErrorDeNavegacion(error: unknown): boolean {
  const digest = (error as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && (digest.startsWith("NEXT_REDIRECT") || digest === "NEXT_NOT_FOUND");
}

/**
 * Envuelve un Server Action con: exigencia de sesión/rol, validación Zod, y
 * mapeo de errores a un `ResultadoAccion` seguro para el estado de un
 * formulario (compatible con `useActionState`). Ningún `try/catch` disperso
 * en los componentes — todo pasa por acá.
 *
 * Solo `ErrorAutorizacion`, `ErrorNegocio` y los errores de Postgres
 * reconocidos (errores-pg.ts) llegan al usuario tal cual; cualquier otro
 * error se loguea completo y se muestra un mensaje genérico, para no
 * filtrar detalles internos por accidente.
 */
export function accionSegura<Esquema extends z.ZodType, T = undefined>(opciones: {
  esquema: Esquema;
  roles?: Rol[];
  ejecutar: (datos: z.infer<Esquema>, usuario: UsuarioSesion) => Promise<T>;
}) {
  return async (
    _estadoPrevio: ResultadoAccion<T> | null,
    entrada: FormData | z.infer<Esquema>,
  ): Promise<ResultadoAccion<T>> => {
    try {
      const usuario = await requerirSesionAccion(opciones.roles);

      const crudo = entrada instanceof FormData ? formDataAObjeto(entrada) : entrada;
      const parseo = opciones.esquema.safeParse(crudo);
      if (!parseo.success) {
        const campos: Record<string, string> = {};
        for (const issue of parseo.error.issues) {
          const clave = issue.path.join(".") || "_general";
          if (!(clave in campos)) campos[clave] = issue.message;
        }
        return { ok: false, error: "Revisá los datos del formulario.", campos };
      }

      const datos = await opciones.ejecutar(parseo.data, usuario);
      return { ok: true, datos };
    } catch (error) {
      if (esErrorDeNavegacion(error)) {
        throw error;
      }
      if (error instanceof ErrorAutorizacion || error instanceof ErrorNegocio) {
        return { ok: false, error: error.message };
      }
      const amigablePg = mensajeAmigablePg(error);
      if (amigablePg) {
        return { ok: false, error: amigablePg };
      }
      console.error("Error inesperado en una Server Action:", error);
      return { ok: false, error: "Ocurrió un error inesperado. Probá de nuevo." };
    }
  };
}
