import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/cliente";
import { avisosBanco, comprobantesWhatsapp, ordenes, tickets } from "@/db/esquema";
import { crearEvento, crearOrden, crearTanda, crearTicket, crearUsuario } from "@/test/fixtures";
import {
  contarOrdenesPendientes,
  listarAvisosBancoSinOrden,
  listarOrdenesPendientes,
  listarOrdenesResueltas,
} from "./aprobaciones-admin";

/** Una orden con su ticket (que es lo que la liga a un evento). */
async function ordenConTicket(datos: {
  organizadorId: number;
  eventoId: number;
  tandaId: number;
  estado?: "pendiente" | "pagada" | "rechazada" | "vencida";
  subtotal?: number;
  codigo?: string;
}) {
  const ordenId = await crearOrden({
    organizadorId: datos.organizadorId,
    estado: datos.estado ?? "pendiente",
    subtotal: datos.subtotal ?? 50000,
    codigo: datos.codigo,
  });
  await crearTicket({ eventoId: datos.eventoId, tandaId: datos.tandaId, ordenId, estado: "pendiente" });
  return ordenId;
}

async function escenario() {
  const organizadorId = await crearUsuario({ rol: "organizador", nombre: "Org Uno" });
  const eventoId = await crearEvento({ organizadorId, nombre: "Festival Uno" });
  const tandaId = await crearTanda({ eventoId });
  return { organizadorId, eventoId, tandaId };
}

describe("listarOrdenesPendientes", () => {
  it("lista solo las pendientes, de la más vieja a la más nueva, con evento y organizador", async () => {
    const e = await escenario();
    const primera = await ordenConTicket({ ...e, codigo: "ORD-PRIMERA" });
    const segunda = await ordenConTicket({ ...e, codigo: "ORD-SEGUNDA" });
    await ordenConTicket({ ...e, estado: "pagada" });
    await db.update(ordenes).set({ creadoEn: new Date("2026-01-01") }).where(eq(ordenes.id, segunda));

    const lista = await listarOrdenesPendientes();

    expect(lista.map((o) => o.id)).toEqual([segunda, primera]);
    expect(lista[1]).toMatchObject({
      codigo: "ORD-PRIMERA",
      estado: "pendiente",
      eventoId: e.eventoId,
      eventoNombre: "Festival Uno",
      organizadorNombre: "Org Uno",
      total: 50000,
      cantidadTickets: 1,
      comprobanteTipo: null,
      comprobantesWa: [],
      avisosBanco: [],
      reservadoHasta: null,
    });
    expect(lista[1].fechaCompra).toBeInstanceOf(Date);
  });

  it("trae los datos de contacto y el Nº de comprobante que cargó el comprador", async () => {
    const e = await escenario();
    const id = await ordenConTicket(e);
    const reserva = new Date(Date.now() + 3_600_000);
    await db
      .update(ordenes)
      .set({ nombreComprador: "Ana", cedula: "123", email: "ana@x.com", contacto: "0981", comprobante: "N-77", reservadoHasta: reserva })
      .where(eq(ordenes.id, id));

    const [orden] = await listarOrdenesPendientes();

    expect(orden).toMatchObject({ nombreComprador: "Ana", cedula: "123", email: "ana@x.com", contacto: "0981", comprobanteTexto: "N-77" });
    expect(orden.reservadoHasta?.getTime()).toBe(reserva.getTime());
  });

  it("distingue imagen y PDF, y usa el archivo del ticket cuando la orden no tiene propio (legacy)", async () => {
    const e = await escenario();
    const conImagen = await ordenConTicket(e);
    const conPdf = await ordenConTicket(e);
    const legacy = await ordenConTicket(e);
    await db.update(ordenes).set({ comprobanteArchivo: "ORD-AAAAAAAAAAAA.JPG" }).where(eq(ordenes.id, conImagen));
    await db.update(ordenes).set({ comprobanteArchivo: "ORD-BBBBBBBBBBBB.pdf" }).where(eq(ordenes.id, conPdf));
    await db.update(tickets).set({ comprobanteArchivo: "EIK-CCCCCCCCCCCC.pdf" }).where(eq(tickets.ordenId, legacy));

    const tipos = Object.fromEntries((await listarOrdenesPendientes()).map((o) => [o.id, o.comprobanteTipo]));

    expect(tipos).toEqual({ [conImagen]: "imagen", [conPdf]: "pdf", [legacy]: "pdf" });
  });

  it("incluye lo recibido por WhatsApp y los avisos del banco asociados a la orden", async () => {
    const e = await escenario();
    const id = await ordenConTicket(e);
    await db.insert(comprobantesWhatsapp).values({
      waMessageId: "wamid.1",
      waFrom: "595981000000",
      estado: "confirmado",
      monto: 50000,
      nroComprobante: "N-1",
      ordenId: id,
    });
    await db.insert(avisosBanco).values({
      messageId: "<a@test>",
      estado: "conciliado",
      banco: "Itaú",
      monto: 50000,
      pagador: "ANA",
      operacion: "OP-1",
      ordenId: id,
    });

    const [orden] = await listarOrdenesPendientes();

    expect(orden.comprobantesWa).toEqual([
      { id: expect.any(Number), waFrom: "595981000000", monto: 50000, estado: "confirmado", nroComprobante: "N-1" },
    ]);
    expect(orden.avisosBanco).toEqual([
      { id: expect.any(Number), monto: 50000, pagador: "ANA", operacion: "OP-1", banco: "Itaú" },
    ]);
  });
});

describe("listarOrdenesResueltas", () => {
  it("lista las aprobadas y rechazadas, la última resuelta primero, y respeta el límite", async () => {
    const e = await escenario();
    await ordenConTicket({ ...e }); // pendiente: no entra
    const vieja = await ordenConTicket({ ...e, estado: "pagada" });
    const nueva = await ordenConTicket({ ...e, estado: "rechazada" });
    await ordenConTicket({ ...e, estado: "vencida" }); // vencida: no entra

    expect((await listarOrdenesResueltas()).map((o) => o.id)).toEqual([nueva, vieja]);
    expect(await listarOrdenesResueltas(1)).toHaveLength(1);
  });
});

describe("contarOrdenesPendientes", () => {
  it("cuenta solo las pendientes", async () => {
    const e = await escenario();
    expect(await contarOrdenesPendientes()).toBe(0);
    await ordenConTicket(e);
    await ordenConTicket(e);
    await ordenConTicket({ ...e, estado: "pagada" });
    expect(await contarOrdenesPendientes()).toBe(2);
  });
});

describe("listarAvisosBancoSinOrden", () => {
  it("solo trae avisos sin cruzar o ambiguos que no están atados a una orden, el más reciente primero", async () => {
    const e = await escenario();
    const orden = await ordenConTicket(e);
    await db.insert(avisosBanco).values([
      { messageId: "<1>", estado: "sin_cruzar", banco: "Itaú", monto: 1000, pagador: "ANA", operacion: "OP-1", recibidoEn: new Date("2026-01-01") },
      { messageId: "<2>", estado: "ambiguo", monto: null, recibidoEn: new Date("2026-02-01") },
      { messageId: "<3>", estado: "conciliado", monto: 3000, ordenId: orden },
      { messageId: "<4>", estado: "descartado", monto: 4000 },
      { messageId: "<5>", estado: "sin_cruzar", monto: 5000, ordenId: orden },
    ]);

    const avisos = await listarAvisosBancoSinOrden();

    expect(avisos).toEqual([
      { id: expect.any(Number), monto: null, pagador: null, operacion: null, banco: null, estado: "ambiguo", recibidoEn: new Date("2026-02-01") },
      { id: expect.any(Number), monto: 1000, pagador: "ANA", operacion: "OP-1", banco: "Itaú", estado: "sin_cruzar", recibidoEn: new Date("2026-01-01") },
    ]);
    expect(await listarAvisosBancoSinOrden(1)).toHaveLength(1);
  });
});
