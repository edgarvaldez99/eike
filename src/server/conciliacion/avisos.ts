import { eq } from "drizzle-orm";
import { db } from "@/db/cliente";
import { avisosBanco } from "@/db/esquema";
import type { EstadoAvisoBanco } from "@/lib/constantes";
import { buscarOrdenPorMonto } from "./ordenes-candidatas";
import type { AvisoParseado } from "./parser-banco";

export interface EntradaAviso {
  messageId: string;
  remitente: string | null;
  autenticado: boolean;
  /** Parseo del cuerpo; null = no es un aviso (solo se guarda si el remitente era sospechoso). */
  datos: AvisoParseado;
  /** true si el remitente o la autenticación no pasaron el control: se guarda como 'descartado'. */
  sospechoso: boolean;
  /** Texto del correo, para mostrárselo al superadmin en la aprobación. */
  cuerpo?: string | null;
}

const CUERPO_MAXIMO = 4000;

export type ResultadoAviso = { estado: EstadoAvisoBanco; ordenId: number | null } | "duplicado";

/**
 * Registra un aviso del banco y lo cruza con una orden pendiente.
 *
 * Regla de cruce (docs de ticketapi, 10-analisis-emails-bancos.md): el MONTO
 * es el matcher primario porque viene en los 3 bancos; el concepto (código de
 * la orden) desempata cuando varias órdenes pendientes comparten monto. Una
 * orden que ya tiene un aviso conciliado no vuelve a ser candidata, así dos
 * pagos iguales a dos órdenes iguales se reparten de a uno.
 *
 * NO aprueba la orden: solo deja constancia de que la plata entró. La
 * aprobación sigue siendo manual hasta que el primer check (comprobante por
 * WhatsApp) esté conectado y ambos coincidan.
 */
export async function registrarAviso(entrada: EntradaAviso): Promise<ResultadoAviso> {
  const { datos } = entrada;
  return db.transaction(async (tx) => {
    let estado: EstadoAvisoBanco = "sin_cruzar";
    let ordenId: number | null = null;

    if (entrada.sospechoso) {
      estado = "descartado";
    } else if (datos.monto !== null) {
      const yaConciliadas = (
        await tx.select({ id: avisosBanco.ordenId }).from(avisosBanco).where(eq(avisosBanco.estado, "conciliado"))
      )
        .map((f) => f.id)
        .filter((id): id is number => id !== null);

      const resultado = await buscarOrdenPorMonto(tx, datos.monto, [datos.referencia], yaConciliadas);
      if ("ordenId" in resultado) {
        estado = "conciliado";
        ordenId = resultado.ordenId;
      } else if (resultado.ambiguas > 1) {
        estado = "ambiguo";
      }
    }

    const insertadas = await tx
      .insert(avisosBanco)
      .values({
        messageId: entrada.messageId,
        remitente: entrada.remitente,
        autenticado: entrada.autenticado,
        banco: datos.banco,
        monto: datos.monto,
        pagador: datos.pagador,
        operacion: datos.operacion,
        referencia: datos.referencia,
        fechaOperacion: datos.fecha,
        cuentaDestino: datos.cuentaDestino?.slice(0, 40) ?? null,
        cuerpo: entrada.cuerpo ? entrada.cuerpo.slice(0, CUERPO_MAXIMO) : null,
        estado,
        ordenId,
      })
      .onConflictDoNothing()
      .returning({ id: avisosBanco.id });

    return insertadas.length === 0 ? "duplicado" : { estado, ordenId };
  });
}
