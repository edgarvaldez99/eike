import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/cliente";
import { asientos, ordenes, tandas, tickets } from "@/db/esquema";
import { barrerReservasVencidas, comprarTicket, rechazarOrden } from "@/server/tickets";
import { crearAsiento, crearEvento, crearOrden, crearTanda, crearTicket, crearUsuario } from "@/test/fixtures";

const datosBase = {
  nombreComprador: "Marta Ovelar",
  cedula: "4123456",
  email: "marta@test.com",
  contacto: "0981000000",
  asientoId: null,
  comprobanteTexto: null,
  comprobante: null,
  codigoCupon: null,
  codigoReferido: null,
};

describe("estado 'agotada' automático (Fase 2 del plan de mejoras)", () => {
  it("comprarTicket marca la tanda 'agotada' al vender el último cupo", async () => {
    const organizadorId = await crearUsuario({ rol: "organizador" });
    const eventoId = await crearEvento({ organizadorId });
    const tandaId = await crearTanda({ eventoId, precio: 0, cantidadTotal: 1, cantidadVendida: 0 });

    await comprarTicket(null, { ...datosBase, eventoId, tandaId });

    const [tanda] = await db.select().from(tandas).where(eq(tandas.id, tandaId));
    expect(tanda.cantidadVendida).toBe(1);
    expect(tanda.estado).toBe("agotada");
  });

  it("rechazarOrden devuelve una tanda 'agotada' a 'activa' al liberar stock", async () => {
    const organizadorId = await crearUsuario({ rol: "organizador" });
    const eventoId = await crearEvento({ organizadorId });
    // cantidadVendida arranca en 0 a propósito: el INSERT de abajo ya la
    // sube a 1 solo, vía trg_tickets_stock (Fase 4) — si también se
    // precargara acá, quedaría contada dos veces y violaría chk_tandas_stock.
    const tandaId = await crearTanda({ eventoId, precio: 50000, cantidadTotal: 1 });
    const ordenId = await crearOrden({ organizadorId, estado: "pendiente", subtotal: 50000 });
    const ticketId = await crearTicket({ eventoId, tandaId, estado: "pendiente", ordenId, precioUnitario: 50000 });
    const [orden] = await db.select().from(ordenes).where(eq(ordenes.id, ordenId));
    // El trigger ya debería haber marcado la tanda 'agotada' al llenarse.
    const [tandaLlena] = await db.select().from(tandas).where(eq(tandas.id, tandaId));
    expect(tandaLlena.estado).toBe("agotada");

    await rechazarOrden(orden);

    const [tanda] = await db.select().from(tandas).where(eq(tandas.id, tandaId));
    expect(tanda.cantidadVendida).toBe(0);
    expect(tanda.estado).toBe("activa");
    const [ticket] = await db.select().from(tickets).where(eq(tickets.id, ticketId));
    expect(ticket.estado).toBe("anulado");
  });

  it("rechazarOrden NO reactiva una tanda que el organizador puso 'inactiva' a mano", async () => {
    const organizadorId = await crearUsuario({ rol: "organizador" });
    const eventoId = await crearEvento({ organizadorId });
    const tandaId = await crearTanda({ eventoId, precio: 50000, cantidadTotal: 5, estado: "inactiva" });
    const ordenId = await crearOrden({ organizadorId, estado: "pendiente", subtotal: 50000 });
    await crearTicket({ eventoId, tandaId, estado: "pendiente", ordenId, precioUnitario: 50000 });
    const [orden] = await db.select().from(ordenes).where(eq(ordenes.id, ordenId));

    await rechazarOrden(orden);

    const [tanda] = await db.select().from(tandas).where(eq(tandas.id, tandaId));
    expect(tanda.estado).toBe("inactiva");
  });
});

describe("barrerReservasVencidas (Fase 3 del plan de mejoras, adaptado a órdenes en la Fase 5)", () => {
  async function armarOrdenPendiente(reservadoHasta: Date) {
    const organizadorId = await crearUsuario({ rol: "organizador" });
    const eventoId = await crearEvento({ organizadorId });
    // cantidadVendida arranca en 0: el INSERT de abajo la sube a 1 solo, vía
    // trg_tickets_stock (Fase 4) — no se precarga acá para no contarla dos veces.
    const tandaId = await crearTanda({ eventoId, precio: 50000, cantidadTotal: 5 });
    const ordenId = await crearOrden({ organizadorId, estado: "pendiente", subtotal: 50000, reservadoHasta });
    const ticketId = await crearTicket({ eventoId, tandaId, estado: "pendiente", ordenId, precioUnitario: 50000 });
    return { ticketId, tandaId, ordenId };
  }

  it("anula una orden vencida y devuelve el stock de todos sus tickets", async () => {
    const { ticketId, tandaId, ordenId } = await armarOrdenPendiente(new Date(Date.now() - 60_000));

    const liberadas = await barrerReservasVencidas();

    expect(liberadas).toBe(1);
    const [ticket] = await db.select().from(tickets).where(eq(tickets.id, ticketId));
    expect(ticket.estado).toBe("anulado");
    const [orden] = await db.select().from(ordenes).where(eq(ordenes.id, ordenId));
    expect(orden.estado).toBe("vencida");
    const [tanda] = await db.select().from(tandas).where(eq(tandas.id, tandaId));
    expect(tanda.cantidadVendida).toBe(0);
  });

  it("no toca una orden que todavía no venció", async () => {
    const { ticketId, ordenId } = await armarOrdenPendiente(new Date(Date.now() + 60 * 60 * 1000));

    const liberadas = await barrerReservasVencidas();

    expect(liberadas).toBe(0);
    const [ticket] = await db.select().from(tickets).where(eq(tickets.id, ticketId));
    expect(ticket.estado).toBe("pendiente");
    const [orden] = await db.select().from(ordenes).where(eq(ordenes.id, ordenId));
    expect(orden.estado).toBe("pendiente");
  });

  it("no toca órdenes que no están 'pendiente' aunque reservado_hasta ya haya pasado", async () => {
    const organizadorId = await crearUsuario({ rol: "organizador" });
    const eventoId = await crearEvento({ organizadorId });
    const tandaId = await crearTanda({ eventoId, precio: 50000 });
    // crearTicket sin ordenId, estado 'disponible' -> la orden automática
    // nace 'pagada' (ver estadoOrdenDesdeTicket en fixtures.ts), así que
    // aunque tuviera reservado_hasta vencido el barrido la ignora igual.
    const ticketId = await crearTicket({ eventoId, tandaId, estado: "disponible" });

    const liberadas = await barrerReservasVencidas();

    expect(liberadas).toBe(0);
    const [ticket] = await db.select().from(tickets).where(eq(tickets.id, ticketId));
    expect(ticket.estado).toBe("disponible");
  });

  it("libera el asiento reservado de un ticket numerado cuando su orden vence", async () => {
    const organizadorId = await crearUsuario({ rol: "organizador" });
    const eventoId = await crearEvento({ organizadorId });
    const tandaId = await crearTanda({ eventoId, precio: 50000, tipo: "numerada", cantidadTotal: 5 });
    const asientoId = await crearAsiento({ tandaId, estado: "reservado" });
    const ordenId = await crearOrden({
      organizadorId,
      estado: "pendiente",
      subtotal: 50000,
      reservadoHasta: new Date(Date.now() - 60_000),
    });
    await crearTicket({ eventoId, tandaId, asientoId, estado: "pendiente", ordenId, precioUnitario: 50000 });

    await barrerReservasVencidas();

    const [asiento] = await db.select().from(asientos).where(eq(asientos.id, asientoId));
    expect(asiento.estado).toBe("disponible");
  });
});
