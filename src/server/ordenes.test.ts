import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/cliente";
import { asientos, ordenes, tickets } from "@/db/esquema";
import { aprobarOrden, obtenerOrdenPendientePropia, obtenerPendientes } from "@/server/tickets";
import { ErrorNegocio } from "@/lib/errores";
import { crearAsiento, crearEvento, crearOrden, crearTanda, crearTicket, crearUsuario } from "@/test/fixtures";
import type { UsuarioSesion } from "@/lib/auth/sesion";

function comoSesion(id: number, rol: UsuarioSesion["rol"]): UsuarioSesion {
  return { id, rol, nombre: "Test", email: "test@test.com", telefono: null, cedula: null, estado: "activo", creadoEn: new Date(), codigoReferido: null, rucFacturacion: null, aliasBancarioTipo: null, aliasBancarioValor: null };
}

/** Orden pendiente con un ticket de tanda numerada, asiento reservado. */
async function armarOrdenNumeradaPendiente() {
  const organizadorId = await crearUsuario({ rol: "organizador" });
  const eventoId = await crearEvento({ organizadorId });
  const tandaId = await crearTanda({ eventoId, precio: 50000, tipo: "numerada", cantidadTotal: 5 });
  const asientoId = await crearAsiento({ tandaId, estado: "reservado" });
  const ordenId = await crearOrden({ organizadorId, estado: "pendiente", subtotal: 50000 });
  const ticketId = await crearTicket({ eventoId, tandaId, asientoId, estado: "pendiente", ordenId, precioUnitario: 50000 });
  return { organizadorId, eventoId, tandaId, asientoId, ordenId, ticketId };
}

describe("aprobarOrden", () => {
  it("pasa la orden a 'pagada' y todos sus tickets a 'disponible'", async () => {
    const { organizadorId, ordenId, ticketId } = await armarOrdenNumeradaPendiente();
    const [orden] = await db.select().from(ordenes).where(eq(ordenes.id, ordenId));

    await aprobarOrden(orden, comoSesion(organizadorId, "organizador"));

    const [ordenAprobada] = await db.select().from(ordenes).where(eq(ordenes.id, ordenId));
    expect(ordenAprobada.estado).toBe("pagada");
    expect(ordenAprobada.aprobadoPor).toBe(organizadorId);
    const [ticket] = await db.select().from(tickets).where(eq(tickets.id, ticketId));
    expect(ticket.estado).toBe("disponible");
    expect(ticket.aprobadoPor).toBe(organizadorId);
  });

  it("bug arreglado (Fase 5): el asiento reservado pasa a 'vendido', no se queda en 'reservado' para siempre", async () => {
    const { organizadorId, asientoId, ordenId } = await armarOrdenNumeradaPendiente();
    const [orden] = await db.select().from(ordenes).where(eq(ordenes.id, ordenId));

    await aprobarOrden(orden, comoSesion(organizadorId, "organizador"));

    const [asiento] = await db.select().from(asientos).where(eq(asientos.id, asientoId));
    expect(asiento.estado).toBe("vendido");
  });

  it("devuelve los eventoId de todos los tickets de la orden, para revalidar sus páginas", async () => {
    const { organizadorId, eventoId, ordenId } = await armarOrdenNumeradaPendiente();
    const [orden] = await db.select().from(ordenes).where(eq(ordenes.id, ordenId));

    const eventosIds = await aprobarOrden(orden, comoSesion(organizadorId, "organizador"));

    expect(eventosIds).toEqual([eventoId]);
  });
});

describe("obtenerOrdenPendientePropia", () => {
  it("rechaza una orden que no le pertenece a un organizador que no es superadmin", async () => {
    const { ordenId } = await armarOrdenNumeradaPendiente();
    const otroOrganizadorId = await crearUsuario({ rol: "organizador" });

    await expect(
      obtenerOrdenPendientePropia(ordenId, comoSesion(otroOrganizadorId, "organizador")),
    ).rejects.toThrow(ErrorNegocio);
  });

  it("un superadmin puede acceder a la orden de cualquier organizador", async () => {
    const { ordenId } = await armarOrdenNumeradaPendiente();
    const superadminId = await crearUsuario({ rol: "superadmin" });

    const orden = await obtenerOrdenPendientePropia(ordenId, comoSesion(superadminId, "superadmin"));
    expect(orden.id).toBe(ordenId);
  });

  it("rechaza una orden que ya no está pendiente", async () => {
    const { organizadorId, ordenId } = await armarOrdenNumeradaPendiente();
    const [orden] = await db.select().from(ordenes).where(eq(ordenes.id, ordenId));
    await aprobarOrden(orden, comoSesion(organizadorId, "organizador"));

    await expect(
      obtenerOrdenPendientePropia(ordenId, comoSesion(organizadorId, "organizador")),
    ).rejects.toThrow("pendientes");
  });
});

describe("obtenerPendientes", () => {
  it("solo lista las órdenes pendientes del organizador (no las de otro, ni las ya resueltas)", async () => {
    const { organizadorId } = await armarOrdenNumeradaPendiente();
    const otroOrganizadorId = await crearUsuario({ rol: "organizador" });
    const otroEventoId = await crearEvento({ organizadorId: otroOrganizadorId });
    const otraTandaId = await crearTanda({ eventoId: otroEventoId, precio: 30000 });
    await crearTicket({ eventoId: otroEventoId, tandaId: otraTandaId, estado: "pendiente" });

    const pendientes = await obtenerPendientes(comoSesion(organizadorId, "organizador"));

    expect(pendientes).toHaveLength(1);
    expect(pendientes[0].total).toBe(50000);
  });

  it("un superadmin ve las órdenes pendientes de todos los organizadores", async () => {
    await armarOrdenNumeradaPendiente();
    const otroOrganizadorId = await crearUsuario({ rol: "organizador" });
    const otroEventoId = await crearEvento({ organizadorId: otroOrganizadorId });
    const otraTandaId = await crearTanda({ eventoId: otroEventoId, precio: 30000 });
    await crearTicket({ eventoId: otroEventoId, tandaId: otraTandaId, estado: "pendiente" });
    const superadminId = await crearUsuario({ rol: "superadmin" });

    const pendientes = await obtenerPendientes(comoSesion(superadminId, "superadmin"));

    expect(pendientes).toHaveLength(2);
  });
});
