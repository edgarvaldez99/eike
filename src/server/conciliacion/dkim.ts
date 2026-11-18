import { Resolver } from "node:dns/promises";
import { dkimVerify } from "mailauth";

type Resolver_ = (dominio: string, tipo: string) => Promise<string[][] | string[]>;

/**
 * Resolvedor DNS para buscar las claves públicas DKIM. Por defecto usa el del
 * sistema; CONCILIACION_DNS_SERVERS="8.8.8.8,1.1.1.1" fuerza servidores
 * concretos (en algunas máquinas de desarrollo Node lee 127.0.0.1 como único
 * servidor y todas las consultas dan ECONNREFUSED).
 */
function resolverDelSistemaOConfigurado(): Resolver_ | undefined {
  const servidores = (process.env.CONCILIACION_DNS_SERVERS ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  if (servidores.length === 0) return undefined;
  const resolvedor = new Resolver();
  resolvedor.setServers(servidores);
  // DKIM solo consulta registros TXT (la clave pública del selector).
  return (dominio) => resolvedor.resolveTxt(dominio);
}

/** Dominio de una dirección ("info@mail.itau.com.py" → "mail.itau.com.py"). */
export function dominioDe(direccion: string): string {
  return direccion.slice(direccion.lastIndexOf("@") + 1).trim().toLowerCase();
}

/** Alineación "relaxed" (como DMARC): el dominio que firmó (d=) y el del From
 * son el mismo, o uno es subdominio del otro. */
export function dominiosAlineados(dominioFirma: string, dominioFrom: string): boolean {
  const d = dominioFirma.toLowerCase();
  const f = dominioFrom.toLowerCase();
  return d === f || f.endsWith(`.${d}`) || d.endsWith(`.${f}`);
}

/**
 * ¿El correo está firmado por el dominio del remitente? Verifica la firma DKIM
 * con criptografía, contra la clave pública que el banco publica en su DNS:
 * no depende de ningún encabezado que agregue (o falsifique) otro servidor —
 * el hosting ni siquiera agrega Authentication-Results. Exige:
 *   - un solo From, bien formado, cuyo dominio sea el del remitente evaluado;
 *   - al menos una firma que dé "pass" y cuyo d= esté alineado con ese dominio.
 * Un atacante puede falsificar el From, pero no firmar como el banco sin su
 * clave privada. Ante cualquier error (DNS caído, mensaje raro) devuelve false.
 */
export async function dkimAutenticaRemitente(
  mensaje: Buffer,
  remitente: string,
  resolver?: Resolver_,
): Promise<boolean> {
  try {
    const consulta = resolver ?? resolverDelSistemaOConfigurado();
    const resultado = await dkimVerify(mensaje, consulta ? { resolver: consulta } : {});
    if (resultado.fromFields !== 1 || resultado.fromSyntax !== "valid" || resultado.headerFrom.length !== 1) {
      return false;
    }
    const dominioFrom = dominioDe(remitente);
    if (dominioDe(resultado.headerFrom[0]) !== dominioFrom) return false;
    return resultado.results.some(
      (r) => r.status.result === "pass" && r.signingDomain && dominiosAlineados(r.signingDomain, dominioFrom),
    );
  } catch {
    return false;
  }
}
