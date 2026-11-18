/**
 * Evento de prueba para probar el flujo de pago por transferencia de punta a
 * punta (comprobante por WhatsApp + aviso del banco por correo): una sola
 * entrada de Gs 5.000, para que probar con plata real cueste poco. Idempotente.
 * Uso: pnpm seed:evento-prueba-pago
 */
import { eq } from "drizzle-orm";
import { db, pool } from "@/db/cliente";
import { eventos, tandas, usuarios } from "@/db/esquema";

const ORGANIZADOR_EMAIL = "organizador@local.test";
const NOMBRE_EVENTO = "Prueba de pago (Gs 5.000)";

async function principal() {
  const organizador = await db.query.usuarios.findFirst({ where: eq(usuarios.email, ORGANIZADOR_EMAIL) });
  if (!organizador) {
    throw new Error(`No existe el usuario organizador "${ORGANIZADOR_EMAIL}" — correr el seed de usuarios primero.`);
  }

  const existente = await db.query.eventos.findFirst({ where: eq(eventos.nombre, NOMBRE_EVENTO) });
  if (existente) {
    console.log(`= "${NOMBRE_EVENTO}" ya existe (id ${existente.id}), no se toca.`);
    return;
  }

  const fecha = new Date();
  fecha.setMonth(fecha.getMonth() + 3);
  const [evento] = await db
    .insert(eventos)
    .values({
      organizadorId: organizador.id,
      nombre: NOMBRE_EVENTO,
      descripcion: "Evento solo para probar el cobro por transferencia y la conciliación automática. No es un evento real.",
      fechaEvento: fecha,
      lugar: "Local de pruebas",
      direccion: "Asunción - Paraguay",
      estado: "publicado",
    })
    .returning({ id: eventos.id });

  await db.insert(tandas).values({ eventoId: evento.id, nombre: "Entrada de prueba", precio: 5_000, cantidadTotal: 50 });
  console.log(`+ "${NOMBRE_EVENTO}" creado (id ${evento.id}) con una entrada de Gs 5.000.`);
}

principal()
  .catch((error) => {
    console.error("Seed falló:", error.message ?? error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
