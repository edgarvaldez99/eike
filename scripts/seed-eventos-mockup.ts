/**
 * Datos de prueba que replican los dos eventos del mockup
 * (docs/GuiaDeEstilos/eike web/eike-webKV.pdf): "Sara Hebe en Paraguay" y
 * "Reciclarte 2026", con los mismos nombres/lugares/afiches — las fechas se
 * corrieron a futuro (las del mockup, agosto/septiembre 2026, ya pasaron
 * respecto a la fecha real) para que `obtenerEventosPublicos` (solo
 * publicados y no vencidos) los muestre en la home. Idempotente — se puede
 * correr muchas veces sin duplicar.
 * Uso: pnpm tsx scripts/seed-eventos-mockup.ts
 */
import { eq } from "drizzle-orm";
import { db, pool } from "@/db/cliente";
import { eventos, tandas, usuarios } from "@/db/esquema";

const ORGANIZADOR_EMAIL = "organizador@local.test";

const EVENTOS = [
  {
    nombre: "Sara Hebe en Paraguay",
    descripcion: "Banda invitada: Vecindad Autopsia. Producido por Orkídea.",
    fechaEvento: new Date("2026-11-21T23:00:00Z"), // 20:00 -03
    lugar: "Voudevil Venue",
    direccion: "Mcal. Estigarribia, Asunción - Paraguay",
    aficheUrl: "/uploads/afiches/2/sara-hebe.jpg",
    tandas: [
      { nombre: "Tanda1", precio: 50_000, cantidadTotal: 150 },
      { nombre: "Tanda2", precio: 80_000, cantidadTotal: 80 },
    ],
  },
  {
    nombre: "Reciclarte 2026",
    descripcion:
      "Dos días para reconectar con el sentido del origen. Comprá el abono para vivir todo el festival, o entrá por el día que quieras. Pilsen presenta Reciclarte 2026.",
    fechaEvento: new Date("2026-12-05T21:00:00Z"), // 18:00 -03
    lugar: "Anfiteatro San Bernardino",
    direccion: "Avda. Wenceslao López 1000",
    aficheUrl: "/uploads/afiches/2/reciclarte-2026.jpg",
    tandas: [
      { nombre: "Abono 2 Días", precio: 150_000, cantidadTotal: 300 },
      { nombre: "Abono por día", precio: 80_000, cantidadTotal: 200 },
    ],
  },
];

async function principal() {
  const organizador = await db.query.usuarios.findFirst({
    where: eq(usuarios.email, ORGANIZADOR_EMAIL),
  });
  if (!organizador) {
    throw new Error(`No existe el usuario organizador "${ORGANIZADOR_EMAIL}" — correr el seed de usuarios primero.`);
  }

  for (const datos of EVENTOS) {
    const existente = await db.query.eventos.findFirst({
      where: eq(eventos.nombre, datos.nombre),
    });
    if (existente) {
      console.log(`  = Evento "${datos.nombre}" ya existe (id ${existente.id}), no se toca.`);
      continue;
    }

    const [evento] = await db
      .insert(eventos)
      .values({
        organizadorId: organizador.id,
        nombre: datos.nombre,
        descripcion: datos.descripcion,
        fechaEvento: datos.fechaEvento,
        lugar: datos.lugar,
        direccion: datos.direccion,
        aficheUrl: datos.aficheUrl,
        estado: "publicado",
      })
      .returning({ id: eventos.id });

    for (const tanda of datos.tandas) {
      await db.insert(tandas).values({
        eventoId: evento.id,
        nombre: tanda.nombre,
        precio: tanda.precio,
        cantidadTotal: tanda.cantidadTotal,
      });
    }

    console.log(`  + Evento "${datos.nombre}" creado (id ${evento.id}) con ${datos.tandas.length} tanda(s).`);
  }
}

principal()
  .then(() => {
    console.log("Seed de eventos del mockup completo.");
  })
  .catch((error) => {
    console.error("Seed falló:", error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
