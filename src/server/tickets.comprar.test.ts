import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/cliente";
import { asientos, tandas, tickets } from "@/db/esquema";
import { comprarTicket } from "@/server/tickets";
import { ErrorNegocio } from "@/lib/errores";
import { crearAsiento, crearEvento, crearTanda, crearUsuario } from "@/test/fixtures";

async function armarEventoConTanda(overrides: Parameters<typeof crearTanda>[0] extends infer T ? Partial<T> : never = {}) {
  const organizadorId = await crearUsuario({ rol: "organizador" });
  const eventoId = await crearEvento({ organizadorId });
  const tandaId = await crearTanda({ eventoId, ...overrides });
  return { organizadorId, eventoId, tandaId };
}

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

describe("comprarTicket", () => {
  it("una tanda gratuita crea el ticket ya 'disponible' (sin pasar por aprobación)", async () => {
    const { eventoId, tandaId } = await armarEventoConTanda({ precio: 0, cantidadTotal: 10 });

    const ticket = await comprarTicket(null, { ...datosBase, eventoId, tandaId });

    expect(ticket.estado).toBe("disponible");
    expect(ticket.reservadoHasta).toBeNull();
  });

  it("una tanda paga sin comprobante rechaza la compra", async () => {
    const { eventoId, tandaId } = await armarEventoConTanda({ precio: 50000, cantidadTotal: 10 });

    await expect(comprarTicket(null, { ...datosBase, eventoId, tandaId })).rejects.toThrow(ErrorNegocio);
  });

  it("una tanda paga con comprobante queda 'pendiente' con una reserva a futuro", async () => {
    const { eventoId, tandaId } = await armarEventoConTanda({ precio: 50000, cantidadTotal: 10 });

    const antes = Date.now();
    const ticket = await comprarTicket(null, {
      ...datosBase,
      eventoId,
      tandaId,
      comprobanteTexto: "transferencia #123",
      comprobante: { buffer: Buffer.from("contenido de prueba"), extension: "jpg" },
    });

    expect(ticket.estado).toBe("pendiente");
    expect(ticket.reservadoHasta).not.toBeNull();
    expect(ticket.reservadoHasta!.getTime()).toBeGreaterThan(antes);
  });

  it("congela el precio de la tanda en el ticket (Fase 4): un cambio de precio después no lo altera", async () => {
    const { eventoId, tandaId } = await armarEventoConTanda({ precio: 100000, cantidadTotal: 10 });

    const ticket = await comprarTicket(null, {
      ...datosBase,
      eventoId,
      tandaId,
      comprobanteTexto: "transferencia #123",
      comprobante: { buffer: Buffer.from("contenido de prueba"), extension: "jpg" },
    });
    expect(ticket.precioUnitario).toBe(100000);
    expect(ticket.precioPagado).toBe(100000);

    // El organizador sube el precio de la tanda DESPUÉS de esta venta — el
    // ticket ya vendido no se tiene que mover: es la reescritura retroactiva
    // que este cambio arregla (antes los reportes leían tandas.precio).
    await db.update(tandas).set({ precio: 200000 }).where(eq(tandas.id, tandaId));

    const [ticketRelido] = await db.select().from(tickets).where(eq(tickets.id, ticket.id));
    expect(ticketRelido.precioUnitario).toBe(100000);
    expect(ticketRelido.precioPagado).toBe(100000);
  });

  it("descuenta cantidadVendida de la tanda en cada compra", async () => {
    const { eventoId, tandaId } = await armarEventoConTanda({ precio: 0, cantidadTotal: 10, cantidadVendida: 3 });

    await comprarTicket(null, { ...datosBase, eventoId, tandaId });

    const [tanda] = await db.select().from(tandas).where(eq(tandas.id, tandaId));
    expect(tanda.cantidadVendida).toBe(4);
  });

  it("rechaza la compra si la tanda ya está agotada", async () => {
    const { eventoId, tandaId } = await armarEventoConTanda({ precio: 0, cantidadTotal: 5, cantidadVendida: 5 });

    await expect(comprarTicket(null, { ...datosBase, eventoId, tandaId })).rejects.toThrow("agotada");
  });

  it("rechaza la compra si el evento no está publicado", async () => {
    const organizadorId = await crearUsuario({ rol: "organizador" });
    const eventoId = await crearEvento({ organizadorId, estado: "borrador" });
    const tandaId = await crearTanda({ eventoId, precio: 0 });

    await expect(comprarTicket(null, { ...datosBase, eventoId, tandaId })).rejects.toThrow(ErrorNegocio);
  });

  it("tanda numerada: autoasigna el asiento disponible más bajo cuando no se pide uno específico", async () => {
    const { eventoId, tandaId } = await armarEventoConTanda({ precio: 0, tipo: "numerada", cantidadTotal: 10 });
    const asientoId = await crearAsiento({ tandaId });

    const ticket = await comprarTicket(null, { ...datosBase, eventoId, tandaId });

    expect(ticket.asientoId).toBe(asientoId);
    const [asiento] = await db.select().from(asientos).where(eq(asientos.id, asientoId));
    expect(asiento.estado).toBe("vendido");
  });

  it("tanda numerada: un comprador logueado puede pedir un asiento específico", async () => {
    const compradorId = await crearUsuario({ rol: "comprador" });
    const { eventoId, tandaId } = await armarEventoConTanda({ precio: 0, tipo: "numerada", cantidadTotal: 10 });
    await crearAsiento({ tandaId, identificador: "A1" });
    const asientoElegido = await crearAsiento({ tandaId, identificador: "A2" });

    const ticket = await comprarTicket(compradorId, { ...datosBase, eventoId, tandaId, asientoId: asientoElegido });

    expect(ticket.asientoId).toBe(asientoElegido);
  });

  it("tanda numerada: rechaza si el asiento pedido ya no está disponible", async () => {
    const compradorId = await crearUsuario({ rol: "comprador" });
    const { eventoId, tandaId } = await armarEventoConTanda({ precio: 0, tipo: "numerada", cantidadTotal: 10 });
    const asientoId = await crearAsiento({ tandaId, estado: "vendido" });

    await expect(
      comprarTicket(compradorId, { ...datosBase, eventoId, tandaId, asientoId }),
    ).rejects.toThrow(ErrorNegocio);
  });

  it("concurrencia: sobre la última entrada, N compras simultáneas solo dejan pasar 1", async () => {
    const { eventoId, tandaId } = await armarEventoConTanda({ precio: 0, cantidadTotal: 10, cantidadVendida: 9 });

    const resultados = await Promise.allSettled(
      Array.from({ length: 8 }, () => comprarTicket(null, { ...datosBase, eventoId, tandaId })),
    );

    const exitosas = resultados.filter((r) => r.status === "fulfilled");
    const fallidas = resultados.filter((r) => r.status === "rejected");
    expect(exitosas).toHaveLength(1);
    expect(fallidas).toHaveLength(7);

    const [tanda] = await db.select().from(tandas).where(eq(tandas.id, tandaId));
    expect(tanda.cantidadVendida).toBe(10);
  });

  it("concurrencia numerada: N compras simultáneas sobre 3 asientos libres asignan exactamente 3", async () => {
    const { eventoId, tandaId } = await armarEventoConTanda({ precio: 0, tipo: "numerada", cantidadTotal: 20 });
    await crearAsiento({ tandaId });
    await crearAsiento({ tandaId });
    await crearAsiento({ tandaId });

    const resultados = await Promise.allSettled(
      Array.from({ length: 6 }, () => comprarTicket(null, { ...datosBase, eventoId, tandaId })),
    );

    const exitosas = resultados.filter((r) => r.status === "fulfilled");
    expect(exitosas).toHaveLength(3);

    const idsAsientos = new Set(
      exitosas.map((r) => (r as PromiseFulfilledResult<Awaited<ReturnType<typeof comprarTicket>>>).value.asientoId),
    );
    // Cada compra exitosa tomó un asiento DISTINTO (SKIP LOCKED, no una fila).
    expect(idsAsientos.size).toBe(3);
  });
});
