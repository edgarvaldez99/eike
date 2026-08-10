import { headers } from "next/headers";

/**
 * Rate limiting en memoria — un solo proceso Node en una VM, sin Redis (no
 * hay presupuesto de RAM para eso en la e2-micro, ver plan §Infraestructura).
 * Ventana fija: se resetea el contador entero al vencer, no es un sliding
 * window exacto, pero alcanza para frenar fuerza bruta/spam de un formulario
 * público — no es la defensa de un sistema de pagos de verdad.
 *
 * OJO: esto vive en la memoria del proceso. Si algún día hay más de una
 * instancia de "web" detrás de Caddy, cada una cuenta por separado (no es
 * un problema hoy: un solo contenedor "web" en compose.prod.yml).
 */
interface Contador {
  cantidad: number;
  reiniciaEn: number;
}

const contadores = new Map<string, Contador>();

// Limpieza perezosa: en vez de un setInterval (que mantendría vivo el
// proceso innecesariamente y complica los tests), se poda una fracción de
// las entradas vencidas en cada llamada.
function podarVencidos(ahora: number) {
  if (contadores.size < 500) return;
  for (const [clave, c] of contadores) {
    if (c.reiniciaEn <= ahora) contadores.delete(clave);
  }
}

export interface ResultadoLimite {
  permitido: boolean;
  /** Segundos hasta que se pueda reintentar, solo si permitido=false. */
  reintentarEnSegundos?: number;
}

/**
 * `clave` debe incluir todo lo que identifique el intento (ej. `login:IP:email`)
 * — cada clave distinta tiene su propio contador y ventana.
 */
export function limitar(clave: string, opciones: { maximo: number; ventanaMs: number }): ResultadoLimite {
  const ahora = Date.now();
  podarVencidos(ahora);

  const actual = contadores.get(clave);
  if (!actual || actual.reiniciaEn <= ahora) {
    contadores.set(clave, { cantidad: 1, reiniciaEn: ahora + opciones.ventanaMs });
    return { permitido: true };
  }

  if (actual.cantidad >= opciones.maximo) {
    return { permitido: false, reintentarEnSegundos: Math.ceil((actual.reiniciaEn - ahora) / 1000) };
  }

  actual.cantidad += 1;
  return { permitido: true };
}

/** Solo para tests: vacía todos los contadores entre casos. */
export function reiniciarLimitesParaTests() {
  contadores.clear();
}

/**
 * IP del cliente detrás de Caddy (que manda X-Forwarded-For — ver
 * docker/Caddyfile). Sin proxy de confianza esto se podría falsear, pero acá
 * el único borde de la red es Caddy mismo, así que es información confiable.
 */
export async function ipCliente(): Promise<string> {
  const h = await headers();
  const adelante = h.get("x-forwarded-for");
  if (adelante) return adelante.split(",")[0].trim();
  return h.get("x-real-ip") ?? "desconocida";
}
