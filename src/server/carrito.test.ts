import { describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/cliente";
import { asientos, carritos, tandas } from "@/db/esquema";
import {
  agregarItemCarrito,
  barrerCarritosVencidos,
  buscarCarritoParaAdoptar,
  checkoutCarrito,
  crearCarrito,
  obtenerResumenCarrito,
  quitarItemCarrito,
  vincularCarritoAUsuario,
} from "@/server/carrito";
import { ErrorNegocio } from "@/lib/errores";
import {
  crearAsiento,
  crearCarritoFixture,
  crearCuponFixture,
  crearEvento,
  crearItemCarritoFixture,
  crearTanda,
  crearUsuario,
} from "@/test/fixtures";

async function releerTanda(tandaId: number) {
  const [fila] = await db.select().from(tandas).where(eq(tandas.id, tandaId));
  return fila;
}

async function releerCarrito(carritoId: number) {
  const [fila] = await db.select().from(carritos).where(eq(carritos.id, carritoId));
  return fila;
}

async function releerAsiento(asientoId: number) {
  const [fila] = await db.select().from(asientos).where(eq(asientos.id, asientoId));
  return fila;
}

/** El único ítem agregado (sin asiento pineado) de un carrito recién armado
 * en el test — atajo para no repetir obtenerResumenCarrito en cada caso que
 * necesita el itemId (quitar/actualizar ya no son por tandaId). */
async function idDelUnicoItem(carritoId: number): Promise<number> {
  const resumen = await obtenerResumenCarrito(carritoId);
  return resumen.items[0].id;
}

const datosCheckoutBase = {
  nombreComprador: "Marta Ovelar",
  cedula: "4123456",
  email: "marta@test.com",
  contacto: "0981000000",
  comprobanteTexto: null,
  comprobante: null,
  codigoCupon: null,
  codigoReferido: null,
};

describe("agregarItemCarrito", () => {
  it("reserva unidades de una tanda: cantidad_reservada sube y disponible baja", async () => {
    const organizadorId = await crearUsuario({ rol: "organizador" });
    const eventoId = await crearEvento({ organizadorId, estado: "publicado" });
    const tandaId = await crearTanda({ eventoId, cantidadTotal: 10 });
    const carrito = await crearCarritoFixture();

    await agregarItemCarrito(carrito.id, { tandaId, cantidad: 3 });

    const tanda = await releerTanda(tandaId);
    expect(tanda.cantidadReservada).toBe(3);
  });

  it("sumar dos veces la misma tanda ACUMULA en una sola fila, no duplica", async () => {
    const organizadorId = await crearUsuario({ rol: "organizador" });
    const eventoId = await crearEvento({ organizadorId, estado: "publicado" });
    const tandaId = await crearTanda({ eventoId, cantidadTotal: 10 });
    const carrito = await crearCarritoFixture();

    await agregarItemCarrito(carrito.id, { tandaId, cantidad: 2 });
    await agregarItemCarrito(carrito.id, { tandaId, cantidad: 3 });

    const resumen = await obtenerResumenCarrito(carrito.id);
    expect(resumen.items).toHaveLength(1);
    expect(resumen.items[0].cantidad).toBe(5);
  });

  it("rechaza agregar más de lo que queda disponible (descontando ya reservado por otros)", async () => {
    const organizadorId = await crearUsuario({ rol: "organizador" });
    const eventoId = await crearEvento({ organizadorId, estado: "publicado" });
    const tandaId = await crearTanda({ eventoId, cantidadTotal: 5 });
    const otroCarrito = await crearCarritoFixture();
    await agregarItemCarrito(otroCarrito.id, { tandaId, cantidad: 4 }); // deja 1 disponible

    const miCarrito = await crearCarritoFixture();
    await expect(agregarItemCarrito(miCarrito.id, { tandaId, cantidad: 2 })).rejects.toThrow("Solo quedan 1");
  });

  it("rechaza mezclar tandas de dos organizadores en el mismo carrito", async () => {
    const orgA = await crearUsuario({ rol: "organizador" });
    const orgB = await crearUsuario({ rol: "organizador" });
    const eventoA = await crearEvento({ organizadorId: orgA, estado: "publicado" });
    const eventoB = await crearEvento({ organizadorId: orgB, estado: "publicado" });
    const tandaA = await crearTanda({ eventoId: eventoA });
    const tandaB = await crearTanda({ eventoId: eventoB });
    const carrito = await crearCarritoFixture();

    await agregarItemCarrito(carrito.id, { tandaId: tandaA, cantidad: 1 });
    await expect(agregarItemCarrito(carrito.id, { tandaId: tandaB, cantidad: 1 })).rejects.toThrow(
      "otro organizador",
    );
  });

  it("permite tandas de eventos DISTINTOS del MISMO organizador (multi-evento sí)", async () => {
    const organizadorId = await crearUsuario({ rol: "organizador" });
    const evento1 = await crearEvento({ organizadorId, estado: "publicado" });
    const evento2 = await crearEvento({ organizadorId, estado: "publicado" });
    const tanda1 = await crearTanda({ eventoId: evento1 });
    const tanda2 = await crearTanda({ eventoId: evento2 });
    const carrito = await crearCarritoFixture();

    await agregarItemCarrito(carrito.id, { tandaId: tanda1, cantidad: 1 });
    await agregarItemCarrito(carrito.id, { tandaId: tanda2, cantidad: 1 });

    const resumen = await obtenerResumenCarrito(carrito.id);
    expect(resumen.items).toHaveLength(2);
  });

  it("rechaza agregar a un carrito ya vencido", async () => {
    const organizadorId = await crearUsuario({ rol: "organizador" });
    const eventoId = await crearEvento({ organizadorId, estado: "publicado" });
    const tandaId = await crearTanda({ eventoId });
    const carrito = await crearCarritoFixture({ expiraEn: new Date(Date.now() - 1000) });

    await expect(agregarItemCarrito(carrito.id, { tandaId, cantidad: 1 })).rejects.toThrow(ErrorNegocio);
  });

  it("concurrencia: sobre la última unidad, N intentos de carritos DISTINTOS solo dejan pasar 1", async () => {
    const organizadorId = await crearUsuario({ rol: "organizador" });
    const eventoId = await crearEvento({ organizadorId, estado: "publicado" });
    const tandaId = await crearTanda({ eventoId, cantidadTotal: 10, cantidadVendida: 9 });
    const carritosDistintos = await Promise.all(Array.from({ length: 8 }, () => crearCarritoFixture()));

    const resultados = await Promise.allSettled(
      carritosDistintos.map((c) => agregarItemCarrito(c.id, { tandaId, cantidad: 1 })),
    );

    expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(resultados.filter((r) => r.status === "rejected")).toHaveLength(7);

    const tanda = await releerTanda(tandaId);
    expect(tanda.cantidadReservada).toBe(1);
  });
});

describe("quitarItemCarrito", () => {
  it("libera la reserva de esa tanda", async () => {
    const organizadorId = await crearUsuario({ rol: "organizador" });
    const eventoId = await crearEvento({ organizadorId, estado: "publicado" });
    const tandaId = await crearTanda({ eventoId, cantidadTotal: 10 });
    const carrito = await crearCarritoFixture();
    await agregarItemCarrito(carrito.id, { tandaId, cantidad: 4 });

    await quitarItemCarrito(carrito.id, await idDelUnicoItem(carrito.id));

    const tanda = await releerTanda(tandaId);
    expect(tanda.cantidadReservada).toBe(0);
    const resumen = await obtenerResumenCarrito(carrito.id);
    expect(resumen.items).toHaveLength(0);
  });
});

describe("checkoutCarrito", () => {
  it("crea una orden con N tickets (una tanda general, varias unidades) y libera la reserva", async () => {
    const organizadorId = await crearUsuario({ rol: "organizador" });
    const eventoId = await crearEvento({ organizadorId, estado: "publicado" });
    const tandaId = await crearTanda({ eventoId, precio: 50000, cantidadTotal: 10 });
    const carrito = await crearCarritoFixture();
    await agregarItemCarrito(carrito.id, { tandaId, cantidad: 3 });

    const resultado = await checkoutCarrito(carrito.id, null, {
      ...datosCheckoutBase,
      comprobanteTexto: "transferencia #1",
      comprobante: { buffer: Buffer.from("comprobante"), extension: "jpg" },
    });

    expect(resultado.tickets).toHaveLength(3);
    expect(resultado.orden.subtotal).toBe(150000);
    expect(resultado.orden.cantidadTickets).toBe(3);

    const tanda = await releerTanda(tandaId);
    expect(tanda.cantidadVendida).toBe(3);
    expect(tanda.cantidadReservada).toBe(0); // ya no cuenta: el carrito quedó 'completado'

    const carritoFinal = await releerCarrito(carrito.id);
    expect(carritoFinal.estado).toBe("completado");
  });

  it("una compra 100% gratis (evento gratuito) no exige comprobante y deja los tickets 'disponible'", async () => {
    const organizadorId = await crearUsuario({ rol: "organizador" });
    const eventoId = await crearEvento({ organizadorId, estado: "publicado" });
    const tandaId = await crearTanda({ eventoId, precio: 0, cantidadTotal: 10 });
    const carrito = await crearCarritoFixture();
    await agregarItemCarrito(carrito.id, { tandaId, cantidad: 2 });

    const resultado = await checkoutCarrito(carrito.id, null, datosCheckoutBase);

    expect(resultado.tickets.every((t) => t.estado === "disponible")).toBe(true);
    expect(resultado.orden.estado).toBe("pagada");
  });

  it("tanda numerada: asigna un asiento distinto por unidad", async () => {
    const organizadorId = await crearUsuario({ rol: "organizador" });
    const eventoId = await crearEvento({ organizadorId, estado: "publicado" });
    const tandaId = await crearTanda({ eventoId, precio: 0, tipo: "numerada", cantidadTotal: 10 });
    await crearAsiento({ tandaId });
    await crearAsiento({ tandaId });
    const carrito = await crearCarritoFixture();
    await agregarItemCarrito(carrito.id, { tandaId, cantidad: 2 });

    const resultado = await checkoutCarrito(carrito.id, null, datosCheckoutBase);

    const asientos = resultado.tickets.map((t) => t.asientoId);
    expect(new Set(asientos).size).toBe(2);
  });

  it("rechaza el checkout de un carrito sin comprobante cuando el total es pago", async () => {
    const organizadorId = await crearUsuario({ rol: "organizador" });
    const eventoId = await crearEvento({ organizadorId, estado: "publicado" });
    const tandaId = await crearTanda({ eventoId, precio: 50000 });
    const carrito = await crearCarritoFixture();
    await agregarItemCarrito(carrito.id, { tandaId, cantidad: 1 });

    await expect(checkoutCarrito(carrito.id, null, datosCheckoutBase)).rejects.toThrow(ErrorNegocio);
  });

  it("rechaza el checkout de un carrito vacío", async () => {
    const carrito = await crearCarritoFixture();
    await expect(checkoutCarrito(carrito.id, null, datosCheckoutBase)).rejects.toThrow("vacío");
  });

  it("rechaza el checkout de un carrito vencido", async () => {
    const organizadorId = await crearUsuario({ rol: "organizador" });
    const eventoId = await crearEvento({ organizadorId, estado: "publicado" });
    const tandaId = await crearTanda({ eventoId, precio: 0 });
    const carrito = await crearCarritoFixture();
    await agregarItemCarrito(carrito.id, { tandaId, cantidad: 1 });
    // Simula el paso del tiempo sin esperar de verdad.
    await db.update(carritos).set({ expiraEn: new Date(Date.now() - 1000) }).where(eq(carritos.id, carrito.id));

    await expect(checkoutCarrito(carrito.id, null, datosCheckoutBase)).rejects.toThrow(ErrorNegocio);
  });

  it("cupón de alcance 'todos mis eventos' descuenta las dos tandas de eventos distintos, suma exacta", async () => {
    const organizadorId = await crearUsuario({ rol: "organizador" });
    const evento1 = await crearEvento({ organizadorId, estado: "publicado" });
    const evento2 = await crearEvento({ organizadorId, estado: "publicado" });
    const tanda1 = await crearTanda({ eventoId: evento1, precio: 30000 });
    const tanda2 = await crearTanda({ eventoId: evento2, precio: 70000 });
    await crearCuponFixture({ organizadorId, eventoId: null, codigo: "TODO10", tipo: "porcentaje", valor: 10 });
    const carrito = await crearCarritoFixture();
    await agregarItemCarrito(carrito.id, { tandaId: tanda1, cantidad: 1 });
    await agregarItemCarrito(carrito.id, { tandaId: tanda2, cantidad: 1 });

    const resultado = await checkoutCarrito(carrito.id, null, {
      ...datosCheckoutBase,
      codigoCupon: "TODO10",
      comprobanteTexto: "transferencia #1",
      comprobante: { buffer: Buffer.from("comprobante"), extension: "jpg" },
    });

    // 10% de 100000 = 10000 — sobre CUALQUIER combinación de tandas.
    expect(resultado.orden.descuento).toBe(10000);
    const sumaDescuentoTickets = resultado.tickets.reduce((s, t) => s + t.descuento, 0);
    expect(sumaDescuentoTickets).toBe(resultado.orden.descuento);
  });

  it("cupón de UN evento no descuenta las tandas del otro evento del carrito", async () => {
    const organizadorId = await crearUsuario({ rol: "organizador" });
    const evento1 = await crearEvento({ organizadorId, estado: "publicado" });
    const evento2 = await crearEvento({ organizadorId, estado: "publicado" });
    const tanda1 = await crearTanda({ eventoId: evento1, precio: 100000 });
    const tanda2 = await crearTanda({ eventoId: evento2, precio: 100000 });
    await crearCuponFixture({ organizadorId, eventoId: evento1, codigo: "SOLO1", tipo: "porcentaje", valor: 50 });
    const carrito = await crearCarritoFixture();
    await agregarItemCarrito(carrito.id, { tandaId: tanda1, cantidad: 1 });
    await agregarItemCarrito(carrito.id, { tandaId: tanda2, cantidad: 1 });

    const resultado = await checkoutCarrito(carrito.id, null, {
      ...datosCheckoutBase,
      codigoCupon: "SOLO1",
      comprobanteTexto: "transferencia #1",
      comprobante: { buffer: Buffer.from("comprobante"), extension: "jpg" },
    });

    // Solo la mitad de tanda1 (50000) — tanda2 queda intacta.
    expect(resultado.orden.descuento).toBe(50000);
    const ticketTanda1 = resultado.tickets.find((t) => t.tandaId === tanda1)!;
    const ticketTanda2 = resultado.tickets.find((t) => t.tandaId === tanda2)!;
    expect(ticketTanda1.descuento).toBe(50000);
    expect(ticketTanda2.descuento).toBe(0);
  });

  it("concurrencia: dos carritos con reservas propias de la misma tanda, checkout simultáneo, ambos exitosos", async () => {
    const organizadorId = await crearUsuario({ rol: "organizador" });
    const eventoId = await crearEvento({ organizadorId, estado: "publicado" });
    const tandaId = await crearTanda({ eventoId, precio: 0, cantidadTotal: 2 });
    const carritoA = await crearCarritoFixture();
    const carritoB = await crearCarritoFixture();
    await agregarItemCarrito(carritoA.id, { tandaId, cantidad: 1 });
    await agregarItemCarrito(carritoB.id, { tandaId, cantidad: 1 });

    const resultados = await Promise.allSettled([
      checkoutCarrito(carritoA.id, null, datosCheckoutBase),
      checkoutCarrito(carritoB.id, null, datosCheckoutBase),
    ]);

    expect(resultados.every((r) => r.status === "fulfilled")).toBe(true);
    const tanda = await releerTanda(tandaId);
    expect(tanda.cantidadVendida).toBe(2);
    expect(tanda.cantidadReservada).toBe(0);
  });

  it("concurrencia multi-tanda: checkouts con dos tandas en órdenes de carga distintos nunca deadlockean (40P01)", async () => {
    const organizadorId = await crearUsuario({ rol: "organizador" });
    const eventoId = await crearEvento({ organizadorId, estado: "publicado" });
    const tandaBaja = await crearTanda({ eventoId, precio: 0, cantidadTotal: 50 });
    const tandaAlta = await crearTanda({ eventoId, precio: 0, cantidadTotal: 50 });

    const carritos10 = await Promise.all(
      Array.from({ length: 10 }, async () => {
        const carrito = await crearCarritoFixture();
        // Fixture directo: inserta los ítems en orden OPUESTO al id de tanda
        // (tandaAlta primero) — checkoutCarrito los tiene que re-ordenar
        // igual antes de bloquear (ver orderBy(carritoItems.tandaId)).
        await crearItemCarritoFixture({ carritoId: carrito.id, tandaId: tandaAlta, cantidad: 1 });
        await crearItemCarritoFixture({ carritoId: carrito.id, tandaId: tandaBaja, cantidad: 1 });
        await db
          .update(carritos)
          .set({ organizadorId, expiraEn: new Date(Date.now() + 60_000) })
          .where(eq(carritos.id, carrito.id));
        return carrito;
      }),
    );

    const resultados = await Promise.allSettled(
      carritos10.map((c) => checkoutCarrito(c.id, null, datosCheckoutBase)),
    );

    const errores40P01 = resultados.filter(
      (r) => r.status === "rejected" && (r.reason as { code?: string })?.code === "40P01",
    );
    expect(errores40P01).toHaveLength(0);
    expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(10);
  });
});

describe("barrerCarritosVencidos", () => {
  it("marca 'vencido' un carrito expirado, borra sus ítems y libera la reserva de su tanda", async () => {
    const organizadorId = await crearUsuario({ rol: "organizador" });
    const eventoId = await crearEvento({ organizadorId, estado: "publicado" });
    const tandaId = await crearTanda({ eventoId, cantidadTotal: 10 });
    const carrito = await crearCarritoFixture();
    await agregarItemCarrito(carrito.id, { tandaId, cantidad: 2 });
    await db.update(carritos).set({ expiraEn: new Date(Date.now() - 1000) }).where(eq(carritos.id, carrito.id));

    const barridos = await barrerCarritosVencidos();

    expect(barridos).toBe(1);
    const carritoFinal = await releerCarrito(carrito.id);
    expect(carritoFinal.estado).toBe("vencido");
    const tanda = await releerTanda(tandaId);
    expect(tanda.cantidadReservada).toBe(0);
  });

  it("un carrito vencido con un asiento pineado lo devuelve a 'disponible'", async () => {
    const organizadorId = await crearUsuario({ rol: "organizador" });
    const eventoId = await crearEvento({ organizadorId, estado: "publicado" });
    const tandaId = await crearTanda({ eventoId, tipo: "numerada", cantidadTotal: 10 });
    const asientoId = await crearAsiento({ tandaId });
    const carrito = await crearCarritoFixture();
    await agregarItemCarrito(carrito.id, { tandaId, cantidad: 1, asientoId });
    await db.update(carritos).set({ expiraEn: new Date(Date.now() - 1000) }).where(eq(carritos.id, carrito.id));

    const barridos = await barrerCarritosVencidos();

    expect(barridos).toBe(1);
    const asiento = await releerAsiento(asientoId);
    expect(asiento.estado).toBe("disponible");
    const tanda = await releerTanda(tandaId);
    expect(tanda.cantidadReservada).toBe(0);
  });

  it("no toca un carrito todavía vigente", async () => {
    const organizadorId = await crearUsuario({ rol: "organizador" });
    const eventoId = await crearEvento({ organizadorId, estado: "publicado" });
    const tandaId = await crearTanda({ eventoId });
    const carrito = await crearCarritoFixture();
    await agregarItemCarrito(carrito.id, { tandaId, cantidad: 1 });

    const barridos = await barrerCarritosVencidos();

    expect(barridos).toBe(0);
    const carritoFinal = await releerCarrito(carrito.id);
    expect(carritoFinal.estado).toBe("activo");
  });
});

describe("agregarItemCarrito con asiento pineado", () => {
  it("pinea el asiento elegido: pasa a 'reservado' y cuenta como reserva de la tanda", async () => {
    const organizadorId = await crearUsuario({ rol: "organizador" });
    const eventoId = await crearEvento({ organizadorId, estado: "publicado" });
    const tandaId = await crearTanda({ eventoId, tipo: "numerada", cantidadTotal: 10 });
    const asientoId = await crearAsiento({ tandaId });
    const carrito = await crearCarritoFixture();

    await agregarItemCarrito(carrito.id, { tandaId, cantidad: 1, asientoId });

    const asiento = await releerAsiento(asientoId);
    expect(asiento.estado).toBe("reservado");
    const tanda = await releerTanda(tandaId);
    expect(tanda.cantidadReservada).toBe(1);
    const resumen = await obtenerResumenCarrito(carrito.id);
    expect(resumen.items[0].asientoId).toBe(asientoId);
  });

  it("un mismo asiento no puede pinearse en dos carritos a la vez", async () => {
    const organizadorId = await crearUsuario({ rol: "organizador" });
    const eventoId = await crearEvento({ organizadorId, estado: "publicado" });
    const tandaId = await crearTanda({ eventoId, tipo: "numerada", cantidadTotal: 10 });
    const asientoId = await crearAsiento({ tandaId });
    const carritoA = await crearCarritoFixture();
    const carritoB = await crearCarritoFixture();
    await agregarItemCarrito(carritoA.id, { tandaId, cantidad: 1, asientoId });

    await expect(agregarItemCarrito(carritoB.id, { tandaId, cantidad: 1, asientoId })).rejects.toThrow(
      "ya no está disponible",
    );
  });

  it("agregar el mismo asiento dos veces desde carritos DISTINTOS concurrentes: solo 1 gana", async () => {
    const organizadorId = await crearUsuario({ rol: "organizador" });
    const eventoId = await crearEvento({ organizadorId, estado: "publicado" });
    const tandaId = await crearTanda({ eventoId, tipo: "numerada", cantidadTotal: 10 });
    const asientoId = await crearAsiento({ tandaId });
    const carritoA = await crearCarritoFixture();
    const carritoB = await crearCarritoFixture();

    const resultados = await Promise.allSettled([
      agregarItemCarrito(carritoA.id, { tandaId, cantidad: 1, asientoId }),
      agregarItemCarrito(carritoB.id, { tandaId, cantidad: 1, asientoId }),
    ]);

    expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const asiento = await releerAsiento(asientoId);
    expect(asiento.estado).toBe("reservado");
  });

  it("quitar un ítem con asiento pineado lo devuelve a 'disponible'", async () => {
    const organizadorId = await crearUsuario({ rol: "organizador" });
    const eventoId = await crearEvento({ organizadorId, estado: "publicado" });
    const tandaId = await crearTanda({ eventoId, tipo: "numerada", cantidadTotal: 10 });
    const asientoId = await crearAsiento({ tandaId });
    const carrito = await crearCarritoFixture();
    await agregarItemCarrito(carrito.id, { tandaId, cantidad: 1, asientoId });

    await quitarItemCarrito(carrito.id, await idDelUnicoItem(carrito.id));

    const asiento = await releerAsiento(asientoId);
    expect(asiento.estado).toBe("disponible");
    const tanda = await releerTanda(tandaId);
    expect(tanda.cantidadReservada).toBe(0);
  });

  it("checkout de un carrito con un asiento pineado + una unidad sin asignar: 2 tickets, 2 asientos distintos", async () => {
    const organizadorId = await crearUsuario({ rol: "organizador" });
    const eventoId = await crearEvento({ organizadorId, estado: "publicado" });
    const tandaId = await crearTanda({ eventoId, precio: 0, tipo: "numerada", cantidadTotal: 10 });
    const asientoPineado = await crearAsiento({ tandaId, identificador: "A1" });
    await crearAsiento({ tandaId, identificador: "A2" });
    const carrito = await crearCarritoFixture();
    await agregarItemCarrito(carrito.id, { tandaId, cantidad: 1, asientoId: asientoPineado });
    await agregarItemCarrito(carrito.id, { tandaId, cantidad: 1 }); // sin asignar todavía

    const resultado = await checkoutCarrito(carrito.id, null, datosCheckoutBase);

    expect(resultado.tickets).toHaveLength(2);
    const idsAsientos = resultado.tickets.map((t) => t.asientoId);
    expect(new Set(idsAsientos).size).toBe(2);
    expect(idsAsientos).toContain(asientoPineado);
  });
});

describe("fusión de carrito entre dispositivos", () => {
  it("vincularCarritoAUsuario fija el dueño solo si todavía no tenía uno", async () => {
    const compradorId = await crearUsuario({ rol: "comprador" });
    const otroCompradorId = await crearUsuario({ rol: "comprador" });
    const carrito = await crearCarritoFixture();

    await vincularCarritoAUsuario(carrito.id, compradorId);
    await vincularCarritoAUsuario(carrito.id, otroCompradorId); // no-op: ya tenía dueño

    const carritoFinal = await releerCarrito(carrito.id);
    expect(carritoFinal.usuarioId).toBe(compradorId);
  });

  it("buscarCarritoParaAdoptar encuentra el último carrito activo de la cuenta si este dispositivo no tiene nada armado", async () => {
    const organizadorId = await crearUsuario({ rol: "organizador" });
    const eventoId = await crearEvento({ organizadorId, estado: "publicado" });
    const tandaId = await crearTanda({ eventoId });
    const compradorId = await crearUsuario({ rol: "comprador" });

    const carritoDelCelular = await crearCarritoFixture();
    await agregarItemCarrito(carritoDelCelular.id, { tandaId, cantidad: 1 });
    await vincularCarritoAUsuario(carritoDelCelular.id, compradorId);

    const carritoDeLaNotebook = await crearCarrito(); // recién creado, sin nada adentro
    const adoptado = await buscarCarritoParaAdoptar(compradorId, carritoDeLaNotebook);

    expect(adoptado?.id).toBe(carritoDelCelular.id);
  });

  it("NO pisa un carrito que este dispositivo ya venía llenando", async () => {
    const organizadorId = await crearUsuario({ rol: "organizador" });
    const eventoId = await crearEvento({ organizadorId, estado: "publicado" });
    const tandaId = await crearTanda({ eventoId });
    const compradorId = await crearUsuario({ rol: "comprador" });

    const carritoDelCelular = await crearCarritoFixture();
    await agregarItemCarrito(carritoDelCelular.id, { tandaId, cantidad: 1 });
    await vincularCarritoAUsuario(carritoDelCelular.id, compradorId);

    const carritoDeLaNotebook = await crearCarrito();
    await agregarItemCarrito(carritoDeLaNotebook.id, { tandaId, cantidad: 1 }); // ya tiene algo propio
    const carritoDeLaNotebookActualizado = await releerCarrito(carritoDeLaNotebook.id); // agregarItemCarrito no devuelve la fila nueva

    const adoptado = await buscarCarritoParaAdoptar(compradorId, carritoDeLaNotebookActualizado);
    expect(adoptado).toBeNull();
  });
});

describe("esperarInvariantesDeStock (helper de verificación, usado como aserción final)", () => {
  it("cantidad_reservada siempre coincide con la suma real de carrito_items de carritos vivos", async () => {
    const organizadorId = await crearUsuario({ rol: "organizador" });
    const eventoId = await crearEvento({ organizadorId, estado: "publicado" });
    const tandaId = await crearTanda({ eventoId, cantidadTotal: 20 });
    const carritoA = await crearCarritoFixture();
    const carritoB = await crearCarritoFixture();
    await agregarItemCarrito(carritoA.id, { tandaId, cantidad: 3 });
    await agregarItemCarrito(carritoB.id, { tandaId, cantidad: 4 });
    await quitarItemCarrito(carritoA.id, await idDelUnicoItem(carritoA.id));

    const { rows } = await db.execute<{ suma: number }>(sql`
      SELECT COALESCE(SUM(ci.cantidad), 0) AS suma
        FROM carrito_items ci
        JOIN carritos c ON c.id = ci.carrito_id
       WHERE ci.tanda_id = ${tandaId} AND c.estado = 'activo' AND c.expira_en > now()
    `);

    const tanda = await releerTanda(tandaId);
    expect(tanda.cantidadReservada).toBe(Number(rows[0].suma));
    expect(tanda.cantidadReservada).toBe(4);
  });
});
