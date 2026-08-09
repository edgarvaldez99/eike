import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db/cliente";
import { asientos, eventos, tandas } from "@/db/esquema";
import { ErrorNegocio } from "@/lib/errores";
import type { TipoTanda } from "@/lib/constantes";

export interface AsientoDisponible {
  id: number;
  identificador: string;
}

/** Puerto de tandas.php?accion=asientos_disponibles — para el selector de asientos del comprador. */
export async function obtenerAsientosDisponibles(tandaId: number): Promise<AsientoDisponible[]> {
  const filas = await db
    .select({ id: asientos.id, identificador: asientos.identificador, fila: asientos.fila, numero: asientos.numero })
    .from(asientos)
    .innerJoin(tandas, eq(tandas.id, asientos.tandaId))
    .where(and(eq(asientos.tandaId, tandaId), eq(asientos.estado, "disponible"), eq(tandas.estado, "activa")))
    .orderBy(asc(asientos.fila), asc(asientos.numero), asc(asientos.identificador));
  return filas.map((f) => ({ id: f.id, identificador: f.identificador }));
}

/** Etiqueta de fila estilo hoja de cálculo: 0→A, 1→B, ..., 25→Z, 26→AA, 27→AB... */
function letraFila(indice: number): string {
  let letra = "";
  let i = indice + 1;
  while (i > 0) {
    const resto = (i - 1) % 26;
    letra = String.fromCharCode(65 + resto) + letra;
    i = Math.floor((i - 1) / 26);
  }
  return letra;
}

export type ModoAsientos = "grilla" | "lista";

export interface DatosMapaAsientos {
  modo: ModoAsientos;
  filas?: number;
  asientosPorFila?: number;
  identificadores?: string[];
}

interface AsientoAGenerar {
  identificador: string;
  fila: string | null;
  numero: number | null;
}

/** Puerto de tandas.php::generarIdentificadoresAsientos. */
function generarIdentificadoresAsientos(datos: DatosMapaAsientos): AsientoAGenerar[] {
  if (datos.modo === "grilla") {
    const filas = datos.filas ?? 0;
    const porFila = datos.asientosPorFila ?? 0;
    if (filas <= 0 || porFila <= 0) {
      throw new ErrorNegocio("Para grilla hacen falta filas y asientos por fila mayores a 0.");
    }
    if (filas * porFila > 5000) {
      throw new ErrorNegocio("El mapa de asientos es demasiado grande (máximo 5000).");
    }
    const generados: AsientoAGenerar[] = [];
    for (let f = 0; f < filas; f++) {
      const letra = letraFila(f);
      for (let n = 1; n <= porFila; n++) {
        generados.push({ identificador: `${letra}${n}`, fila: letra, numero: n });
      }
    }
    return generados;
  }

  const identificadores = (datos.identificadores ?? []).map((v) => v.trim()).filter(Boolean);
  if (identificadores.length === 0) {
    throw new ErrorNegocio("Falta la lista de identificadores de asiento.");
  }
  if (new Set(identificadores).size !== identificadores.length) {
    throw new ErrorNegocio("Hay identificadores de asiento repetidos en la lista.");
  }
  if (identificadores.length > 5000) {
    throw new ErrorNegocio("El mapa de asientos es demasiado grande (máximo 5000).");
  }
  return identificadores.map((identificador) => ({ identificador, fila: null, numero: null }));
}

/** Si la suma de cantidad_total de las tandas supera el aforo_total, devuelve un texto de advertencia (no bloquea). */
export async function advertenciaAforo(eventoId: number): Promise<string | null> {
  const [fila] = await db
    .select({
      aforoTotal: eventos.aforoTotal,
      sumaTandas: sql<number>`coalesce(sum(${tandas.cantidadTotal}), 0)`,
    })
    .from(eventos)
    .leftJoin(tandas, eq(tandas.eventoId, eventos.id))
    .where(eq(eventos.id, eventoId))
    .groupBy(eventos.id, eventos.aforoTotal);

  if (!fila || fila.aforoTotal === null) return null;
  const sumaTandas = Number(fila.sumaTandas);
  if (sumaTandas > fila.aforoTotal) {
    return `La suma de stock de las tandas (${sumaTandas}) supera el aforo total (${fila.aforoTotal}).`;
  }
  return null;
}

export interface DatosCrearTanda {
  eventoId: number;
  nombre: string;
  tipo: TipoTanda;
  precio: number;
  cantidadTotal?: number;
  mapaAsientos?: DatosMapaAsientos;
}

/** El evento ya se validó como propio/superadmin y no cancelado/finalizado antes de llamar acá. */
export async function crearTanda(
  evento: typeof eventos.$inferSelect,
  datos: DatosCrearTanda,
): Promise<{ id: number; advertencia: string | null }> {
  if (evento.estado === "cancelado" || evento.estado === "finalizado") {
    throw new ErrorNegocio("No se pueden agregar tandas a un evento cancelado o finalizado.");
  }
  if (datos.precio < 0) {
    throw new ErrorNegocio("El precio no puede ser negativo.");
  }
  if (evento.esGratuito && datos.precio !== 0) {
    throw new ErrorNegocio("Un evento gratuito no puede tener tandas con precio.");
  }

  const id = await db.transaction(async (tx) => {
    if (datos.tipo === "general") {
      const cantidadTotal = datos.cantidadTotal ?? 0;
      if (cantidadTotal <= 0) {
        throw new ErrorNegocio("La cantidad total tiene que ser mayor a 0.");
      }
      const [creada] = await tx
        .insert(tandas)
        .values({
          eventoId: datos.eventoId,
          nombre: datos.nombre,
          tipo: "general",
          precio: datos.precio,
          cantidadTotal,
          estado: "activa",
        })
        .returning({ id: tandas.id });
      return creada.id;
    }

    if (!datos.mapaAsientos) {
      throw new ErrorNegocio('Falta el mapa de asientos ("grilla" o "lista") para una tanda numerada.');
    }
    const listaAsientos = generarIdentificadoresAsientos(datos.mapaAsientos);

    const [creada] = await tx
      .insert(tandas)
      .values({
        eventoId: datos.eventoId,
        nombre: datos.nombre,
        tipo: "numerada",
        precio: datos.precio,
        cantidadTotal: listaAsientos.length,
        estado: "activa",
      })
      .returning({ id: tandas.id });

    await tx.insert(asientos).values(
      listaAsientos.map((a) => ({
        tandaId: creada.id,
        identificador: a.identificador,
        fila: a.fila,
        numero: a.numero,
        estado: "disponible" as const,
      })),
    );
    return creada.id;
  });

  return { id, advertencia: await advertenciaAforo(datos.eventoId) };
}

export interface DatosEditarTanda {
  nombre: string;
  precio: number;
  cantidadTotal?: number;
  estado?: "activa" | "inactiva";
}

/** La tanda ya se validó como propia/superadmin antes de llamar acá (ver guardas.tandaPropia). */
export async function editarTanda(tanda: typeof tandas.$inferSelect, datos: DatosEditarTanda) {
  if (datos.cantidadTotal !== undefined && tanda.tipo === "numerada") {
    throw new ErrorNegocio(
      "El stock de una tanda numerada se define por su mapa de asientos, no se edita directo.",
    );
  }
  // chk_tandas_stock (Postgres CHECK) rechaza bajar cantidad_total por debajo
  // de lo vendido; el mensaje amigable sale de src/lib/errores-pg.ts.
  await db
    .update(tandas)
    .set({
      nombre: datos.nombre,
      precio: datos.precio,
      ...(datos.cantidadTotal !== undefined ? { cantidadTotal: datos.cantidadTotal } : {}),
      ...(datos.estado !== undefined ? { estado: datos.estado } : {}),
    })
    .where(eq(tandas.id, tanda.id));
}

/** La tanda ya se validó como propia/superadmin antes de llamar acá. */
export async function eliminarTanda(tanda: typeof tandas.$inferSelect) {
  // El trigger trg_tandas_delete_bd (SQLSTATE EIK01) rechaza el borrado si
  // cantidad_vendida > 0; el mensaje amigable sale de src/lib/errores-pg.ts.
  await db.transaction(async (tx) => {
    if (tanda.tipo === "numerada") {
      await tx.delete(asientos).where(eq(asientos.tandaId, tanda.id));
    }
    await tx.delete(tandas).where(eq(tandas.id, tanda.id));
  });
}
