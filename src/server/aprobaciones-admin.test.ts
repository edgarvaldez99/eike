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
      avisosCandidatos: [],
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

  it("incluye lo recibido por WhatsApp y los avisos del banco asociados, con qué datos coinciden", async () => {
    const e = await escenario();
    const id = await ordenConTicket(e);
    await db.insert(comprobantesWhatsapp).values({
      waMessageId: "wamid.1",
      waFrom: "595981000000",
      estado: "confirmado",
      monto: 50000,
      pagador: "ANA MARIA PEREZ",
      nroComprobante: "N-1",
      ordenId: id,
    });
    await db.insert(avisosBanco).values([
      { messageId: "<a@test>", estado: "conciliado", banco: "Itaú", monto: 50000, pagador: "PEREZ ANA MARIA", operacion: "OP-1", ordenId: id },
      { messageId: "<b@test>", estado: "ambiguo", banco: "Familiar", monto: 70000, pagador: "OTRA PERSONA", referencia: "nota", ordenId: id },
    ]);

    const [orden] = await listarOrdenesPendientes();

    expect(orden.comprobantesWa).toEqual([
      {
        id: expect.any(Number),
        waFrom: "595981000000",
        monto: 50000,
        pagador: "ANA MARIA PEREZ",
        estado: "confirmado",
        nroComprobante: "N-1",
        banco: null,
        cuentaDestino: null,
        fecha: null,
        origen: "whatsapp",
        coincidenciasRegistradas: [],
      },
    ]);
    expect(orden.avisosBanco).toEqual([
      expect.objectContaining({ monto: 50000, pagador: "PEREZ ANA MARIA", operacion: "OP-1", referencia: null, banco: "Itaú", coincidencias: ["monto", "pagador"] }),
      expect.objectContaining({ monto: 70000, pagador: "OTRA PERSONA", operacion: null, referencia: "nota", banco: "Familiar", coincidencias: [] }),
    ]);
    expect(orden.avisosBanco[0]).toMatchObject({ estado: "conciliado", autenticado: false, cuerpo: null, fechaOperacion: null });
    expect(orden.avisosBanco[0].recibidoEn).toBeInstanceOf(Date);
  });

  it("sin comprobantes de WhatsApp en la orden, los avisos no tienen coincidencias que mostrar", async () => {
    const e = await escenario();
    const id = await ordenConTicket(e);
    await db.insert(avisosBanco).values({ messageId: "<c@test>", estado: "conciliado", monto: 50000, ordenId: id });

    const [orden] = await listarOrdenesPendientes();

    expect(orden.avisosBanco[0].coincidencias).toEqual([]);
  });
});

describe("comprobante leído por OCR", () => {
  it("trae lo que leyó el OCR de la foto del carrito y qué coincidió con el correo del banco", async () => {
    const e = await escenario();
    const id = await ordenConTicket(e);
    await db.insert(comprobantesWhatsapp).values({
      waMessageId: "carrito:ORD-X",
      waFrom: "595961746430",
      estado: "confirmado",
      origen: "carrito",
      banco: "Itaú",
      monto: 50000,
      cuentaDestino: "81123742",
      fechaOperacion: "19/11/2026 22:54",
      coincidencias: "monto,cuenta,fecha",
      ordenId: id,
    });
    const [orden] = await listarOrdenesPendientes();
    expect(orden.comprobantesWa[0]).toMatchObject({
      origen: "carrito",
      banco: "Itaú",
      cuentaDestino: "81123742",
      fecha: "19/11/2026 22:54",
      coincidenciasRegistradas: ["monto", "cuenta", "fecha"],
    });
  });
});

describe("avisos candidatos y texto del correo", () => {
  it("trae el texto del correo y la fecha de la operación de un aviso asociado", async () => {
    const e = await escenario();
    const id = await ordenConTicket(e);
    await db.insert(avisosBanco).values({
      messageId: "<t@test>",
      estado: "conciliado",
      monto: 50000,
      ordenId: id,
      autenticado: true,
      fechaOperacion: "16/11/2026 20:30:00",
      cuentaDestino: "81123742",
      cuerpo: "Transferencia recibida PYG 50,000",
    });
    const [orden] = await listarOrdenesPendientes();
    expect(orden.avisosBanco[0]).toMatchObject({
      autenticado: true,
      fechaOperacion: "16/11/2026 20:30:00",
      cuentaDestino: "81123742",
      cuerpo: "Transferencia recibida PYG 50,000",
    });
  });

  it("lista los avisos recientes sin atar (el de igual monto primero, y también los de otro monto) sin los ya atados ni descartados", async () => {
    const e = await escenario();
    const id = await ordenConTicket(e);
    const otra = await ordenConTicket(e);
    await db.insert(avisosBanco).values([
      { messageId: "<c1@test>", estado: "sin_cruzar", monto: 99000, pagador: "OTRO MONTO" },
      { messageId: "<c2@test>", estado: "ambiguo", monto: 50000, pagador: "MISMO MONTO" },
      { messageId: "<c3@test>", estado: "sin_cruzar", monto: 50, pagador: "PAGO DE MENOS" },
      { messageId: "<c4@test>", estado: "conciliado", monto: 50000, ordenId: otra },
      { messageId: "<c5@test>", estado: "descartado", monto: 50000 },
    ]);
    const lista = await listarOrdenesPendientes();
    const orden = lista.find((o) => o.id === id)!;
    expect(orden.avisosCandidatos[0].pagador).toBe("MISMO MONTO");
    expect(orden.avisosCandidatos.map((a) => a.pagador).sort()).toEqual(["MISMO MONTO", "OTRO MONTO", "PAGO DE MENOS"]);
    expect(orden.avisosBanco).toEqual([]);
  });

  it("no considera avisos de hace más de 3 días", async () => {
    const e = await escenario();
    const id = await ordenConTicket(e);
    await db.insert(avisosBanco).values({
      messageId: "<viejo@test>",
      estado: "sin_cruzar",
      monto: 50000,
      recibidoEn: new Date(Date.now() - 4 * 24 * 3_600_000),
    });
    const orden = (await listarOrdenesPendientes()).find((o) => o.id === id)!;
    expect(orden.avisosCandidatos).toEqual([]);
  });

  it("limita los candidatos a los 50 más recientes", async () => {
    const e = await escenario();
    const id = await ordenConTicket(e);
    await db.insert(avisosBanco).values(
      Array.from({ length: 60 }, (_, i) => ({ messageId: `<m${i}@test>`, estado: "sin_cruzar" as const, monto: 50000, operacion: `OP-${i}` })),
    );
    const orden = (await listarOrdenesPendientes()).find((o) => o.id === id)!;
    expect(orden.avisosCandidatos).toHaveLength(50);
    expect(orden.avisosCandidatos[0].operacion).toBe("OP-59");
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
