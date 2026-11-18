import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/cliente";
import { ordenes, tickets } from "@/db/esquema";
import { crearEvento, crearOrden, crearTanda, crearTicket, crearUsuario } from "@/test/fixtures";
import { buscarComprobantePendiente } from "./comprobante-compra";

async function compra(datos: { estado?: "pendiente" | "pagada" | "rechazada"; archivoOrden?: string; archivoTicket?: string }) {
  const organizadorId = await crearUsuario({ rol: "organizador" });
  const eventoId = await crearEvento({ organizadorId });
  const tandaId = await crearTanda({ eventoId });
  const ordenId = await crearOrden({ organizadorId, estado: datos.estado ?? "pendiente", codigo: "ORD-ABCDEF123456" });
  const ticketId = await crearTicket({ eventoId, tandaId, ordenId, estado: "pendiente", codigo: "EIK-ABCDEF123456" });
  if (datos.archivoOrden) await db.update(ordenes).set({ comprobanteArchivo: datos.archivoOrden }).where(eq(ordenes.id, ordenId));
  if (datos.archivoTicket) await db.update(tickets).set({ comprobanteArchivo: datos.archivoTicket }).where(eq(tickets.id, ticketId));
}

describe("buscarComprobantePendiente", () => {
  it("por código de orden (ORD-…): devuelve el archivo de la orden", async () => {
    await compra({ archivoOrden: "ORD-ABCDEF123456.jpg" });
    expect(await buscarComprobantePendiente("ORD-ABCDEF123456")).toBe("ORD-ABCDEF123456.jpg");
  });

  it("por código de ticket (EIK-…): llega a la orden del ticket", async () => {
    await compra({ archivoOrden: "ORD-ABCDEF123456.jpg" });
    expect(await buscarComprobantePendiente("EIK-ABCDEF123456")).toBe("ORD-ABCDEF123456.jpg");
  });

  it("órdenes viejas (backfill): si la orden no tiene archivo, usa el de su ticket", async () => {
    await compra({ archivoTicket: "EIK-ABCDEF123456.png" });
    expect(await buscarComprobantePendiente("ORD-ABCDEF123456")).toBe("EIK-ABCDEF123456.png");
  });

  it("sin comprobante en la orden ni en el ticket → null", async () => {
    await compra({});
    expect(await buscarComprobantePendiente("ORD-ABCDEF123456")).toBeNull();
  });

  it("una vez aprobada o rechazada, el comprobante deja de entregarse", async () => {
    await compra({ estado: "pagada", archivoOrden: "ORD-ABCDEF123456.jpg" });
    expect(await buscarComprobantePendiente("ORD-ABCDEF123456")).toBeNull();
    expect(await buscarComprobantePendiente("EIK-ABCDEF123456")).toBeNull();
  });

  it("un código que no existe → null", async () => {
    expect(await buscarComprobantePendiente("ORD-000000000000")).toBeNull();
    expect(await buscarComprobantePendiente("EIK-000000000000")).toBeNull();
  });
});
