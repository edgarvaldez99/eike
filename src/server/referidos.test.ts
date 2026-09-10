import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/cliente";
import { ordenes, premiosReferidos, referidosVentas, tickets, usuarios } from "@/db/esquema";
import { comprarTicket } from "@/server/tickets";
import {
  crearPrograma,
  esVentaReferidaValida,
  obtenerOCrearCodigoReferido,
  resolverReferidor,
} from "@/server/referidos";
import { aprobarOrden, obtenerOrdenPendientePropia } from "@/server/tickets";
import { ErrorNegocio } from "@/lib/errores";
import { crearEvento, crearTanda, crearUsuario } from "@/test/fixtures";
import type { UsuarioSesion } from "@/lib/auth/sesion";

function comoSesion(id: number, rol: UsuarioSesion["rol"]): UsuarioSesion {
  return { id, rol, nombre: "Test", email: "test@test.com", telefono: null, cedula: null, estado: "activo", creadoEn: new Date(), codigoReferido: null, rucFacturacion: null, aliasBancarioTipo: null, aliasBancarioValor: null };
}

const datosBase = {
  nombreComprador: "Marta Ovelar",
  cedula: "4123456",
  contacto: "0981000000",
  asientoId: null,
  comprobanteTexto: null,
  codigoCupon: null,
};

describe("obtenerOCrearCodigoReferido", () => {
  it("genera un código y es idempotente (llamarla de nuevo devuelve el mismo)", async () => {
    const usuarioId = await crearUsuario({ rol: "comprador" });

    const codigo1 = await obtenerOCrearCodigoReferido(usuarioId);
    const codigo2 = await obtenerOCrearCodigoReferido(usuarioId);

    expect(codigo1).toBe(codigo2);
    expect(codigo1).toHaveLength(8);
    const [fila] = await db.select({ codigoReferido: usuarios.codigoReferido }).from(usuarios).where(eq(usuarios.id, usuarioId));
    expect(fila.codigoReferido).toBe(codigo1);
  });
});

describe("resolverReferidor", () => {
  it("encuentra al dueño de un código (sin distinguir mayúsculas)", async () => {
    const usuarioId = await crearUsuario({ rol: "comprador", email: "vendedor@test.com" });
    const codigo = await obtenerOCrearCodigoReferido(usuarioId);

    const referidor = await resolverReferidor(codigo.toLowerCase());
    expect(referidor?.id).toBe(usuarioId);
  });

  it("devuelve null para un código que no existe", async () => {
    expect(await resolverReferidor("NOEXISTE")).toBeNull();
  });
});

describe("esVentaReferidaValida (anti-fraude)", () => {
  const referidor = { id: 1, nombre: "Ref", email: "ref@test.com", cedula: "1111111" };

  it("acepta una venta legítima", () => {
    expect(
      esVentaReferidaValida({ referidor, organizadorId: 2, compradorId: 3, email: "otro@test.com", cedula: "2222222" }),
    ).toBe(true);
  });

  it("rechaza si el organizador se refiere a sí mismo", () => {
    expect(
      esVentaReferidaValida({ referidor, organizadorId: 1, compradorId: 3, email: "otro@test.com", cedula: null }),
    ).toBe(false);
  });

  it("rechaza el auto-referido con cuenta (mismo id de comprador)", () => {
    expect(
      esVentaReferidaValida({ referidor, organizadorId: 2, compradorId: 1, email: "otro@test.com", cedula: null }),
    ).toBe(false);
  });

  it("rechaza el auto-referido de invitado (mismo email, sin distinguir mayúsculas)", () => {
    expect(
      esVentaReferidaValida({ referidor, organizadorId: 2, compradorId: null, email: "REF@test.com", cedula: null }),
    ).toBe(false);
  });

  it("rechaza si coincide la cédula, aunque el email sea distinto", () => {
    expect(
      esVentaReferidaValida({ referidor, organizadorId: 2, compradorId: null, email: "otro@test.com", cedula: "1111111" }),
    ).toBe(false);
  });
});

describe("comprarTicket con código de referido (Fase 8, integración)", () => {
  it("atribuye la venta y la deja 'pendiente' hasta que se apruebe la orden", async () => {
    const organizadorId = await crearUsuario({ rol: "organizador" });
    const eventoId = await crearEvento({ organizadorId });
    const tandaId = await crearTanda({ eventoId, precio: 100000, cantidadTotal: 20 });
    const referidorId = await crearUsuario({ rol: "comprador", email: "vendedora@test.com" });
    const codigoReferido = await obtenerOCrearCodigoReferido(referidorId);

    const ticket = await comprarTicket(null, {
      ...datosBase,
      eventoId,
      tandaId,
      email: "compradora@test.com",
      comprobante: { buffer: Buffer.from("x"), extension: "jpg" },
      codigoReferido,
    });

    const [orden] = await db.select().from(ordenes).where(eq(ordenes.id, ticket.ordenId));
    expect(orden.referidoPorUsuarioId).toBe(referidorId);
    expect(orden.codigoReferido).toBe(codigoReferido);

    const [venta] = await db.select().from(referidosVentas).where(eq(referidosVentas.ordenId, ticket.ordenId));
    expect(venta.estado).toBe("pendiente");
    expect(venta.monto).toBe(100000);
  });

  it("un código inválido no rompe la compra: la venta queda sin atribuir", async () => {
    const organizadorId = await crearUsuario({ rol: "organizador" });
    const eventoId = await crearEvento({ organizadorId });
    const tandaId = await crearTanda({ eventoId, precio: 0, cantidadTotal: 20 });

    const ticket = await comprarTicket(null, {
      ...datosBase,
      eventoId,
      tandaId,
      email: "compradora@test.com",
      comprobante: null,
      codigoReferido: "NOEXISTE",
    });

    const [orden] = await db.select().from(ordenes).where(eq(ordenes.id, ticket.ordenId));
    expect(orden.referidoPorUsuarioId).toBeNull();
    const ventas = await db.select().from(referidosVentas).where(eq(referidosVentas.ordenId, ticket.ordenId));
    expect(ventas).toHaveLength(0);
  });

  it("el organizador no puede referirse a sí mismo en su propio evento", async () => {
    const organizadorId = await crearUsuario({ rol: "organizador", email: "org@test.com" });
    const eventoId = await crearEvento({ organizadorId });
    const tandaId = await crearTanda({ eventoId, precio: 0, cantidadTotal: 20 });
    const codigoReferido = await obtenerOCrearCodigoReferido(organizadorId);

    const ticket = await comprarTicket(null, {
      ...datosBase,
      eventoId,
      tandaId,
      email: "compradora@test.com",
      comprobante: null,
      codigoReferido,
    });

    const [orden] = await db.select().from(ordenes).where(eq(ordenes.id, ticket.ordenId));
    expect(orden.referidoPorUsuarioId).toBeNull();
  });

  it("una compra gratis registra la venta ya 'valida' (nace resuelta, sin aprobación manual)", async () => {
    const organizadorId = await crearUsuario({ rol: "organizador" });
    const eventoId = await crearEvento({ organizadorId });
    const tandaId = await crearTanda({ eventoId, precio: 0, cantidadTotal: 20 });
    const referidorId = await crearUsuario({ rol: "comprador", email: "vendedora2@test.com" });
    const codigoReferido = await obtenerOCrearCodigoReferido(referidorId);

    const ticket = await comprarTicket(null, {
      ...datosBase,
      eventoId,
      tandaId,
      email: "compradora2@test.com",
      comprobante: null,
      codigoReferido,
    });

    const [venta] = await db.select().from(referidosVentas).where(eq(referidosVentas.ordenId, ticket.ordenId));
    expect(venta.estado).toBe("valida");
    expect(venta.confirmadaEn).not.toBeNull();
  });
});

describe("aprobarOrden sincroniza la venta referida y otorga premios", () => {
  it("al aprobar la orden, la venta referida pasa a 'valida'", async () => {
    const organizadorId = await crearUsuario({ rol: "organizador" });
    const eventoId = await crearEvento({ organizadorId });
    const tandaId = await crearTanda({ eventoId, precio: 50000, cantidadTotal: 20 });
    const referidorId = await crearUsuario({ rol: "comprador", email: "vendedora3@test.com" });
    const codigoReferido = await obtenerOCrearCodigoReferido(referidorId);

    const ticket = await comprarTicket(null, {
      ...datosBase,
      eventoId,
      tandaId,
      email: "compradora3@test.com",
      comprobante: { buffer: Buffer.from("x"), extension: "jpg" },
      codigoReferido,
    });

    const orden = await obtenerOrdenPendientePropia(ticket.ordenId, comoSesion(organizadorId, "organizador"));
    await aprobarOrden(orden, comoSesion(organizadorId, "organizador"));

    const [venta] = await db.select().from(referidosVentas).where(eq(referidosVentas.ordenId, ticket.ordenId));
    expect(venta.estado).toBe("valida");
  });

  it("al cruzar el umbral de ventas, se otorga exactamente 1 premio (cortesía de la tanda elegida)", async () => {
    const organizadorId = await crearUsuario({ rol: "organizador" });
    const eventoId = await crearEvento({ organizadorId });
    const tandaId = await crearTanda({ eventoId, precio: 50000, cantidadTotal: 20 });
    const tandaPremioId = await crearTanda({ eventoId, nombre: "Premio", precio: 0, cantidadTotal: 5 });
    const referidorId = await crearUsuario({ rol: "comprador", email: "vendedora4@test.com" });
    const codigoReferido = await obtenerOCrearCodigoReferido(referidorId);

    const programaId = await crearPrograma(comoSesion(organizadorId, "organizador"), {
      eventoId,
      nombre: "Embajadores",
      ventasRequeridas: 2,
      tandaPremioId,
    });

    // 2 ventas referidas, cada una aprobada -> cruza el umbral en la segunda.
    for (let i = 0; i < 2; i++) {
      const ticket = await comprarTicket(null, {
        ...datosBase,
        eventoId,
        tandaId,
        email: `compradora-umbral-${i}@test.com`,
        comprobante: { buffer: Buffer.from("x"), extension: "jpg" },
        codigoReferido,
      });
      const orden = await obtenerOrdenPendientePropia(ticket.ordenId, comoSesion(organizadorId, "organizador"));
      await aprobarOrden(orden, comoSesion(organizadorId, "organizador"));
    }

    const premios = await db.select().from(premiosReferidos).where(eq(premiosReferidos.programaId, programaId));
    expect(premios).toHaveLength(1);
    expect(premios[0].estado).toBe("otorgado");
    expect(premios[0].ticketCortesiaId).not.toBeNull();

    const [ticketCortesia] = await db.select().from(tickets).where(eq(tickets.id, premios[0].ticketCortesiaId!));
    expect(ticketCortesia.tandaId).toBe(tandaPremioId);
    expect(ticketCortesia.esCortesia).toBe(true);
  });

  it("si la tanda-premio no tiene cupo, el premio queda 'pendiente_stock' SIN abortar la aprobación de la orden", async () => {
    const organizadorId = await crearUsuario({ rol: "organizador" });
    const eventoId = await crearEvento({ organizadorId });
    const tandaId = await crearTanda({ eventoId, precio: 50000, cantidadTotal: 20 });
    // Tanda-premio ya sin cupo desde el día uno.
    const tandaPremioId = await crearTanda({ eventoId, nombre: "Premio sin cupo", precio: 0, cantidadTotal: 0 });
    const referidorId = await crearUsuario({ rol: "comprador", email: "vendedora5@test.com" });
    const codigoReferido = await obtenerOCrearCodigoReferido(referidorId);

    const programaId = await crearPrograma(comoSesion(organizadorId, "organizador"), {
      eventoId,
      nombre: "Sin cupo",
      ventasRequeridas: 1,
      tandaPremioId,
    });

    const ticket = await comprarTicket(null, {
      ...datosBase,
      eventoId,
      tandaId,
      email: "compradora-sin-cupo@test.com",
      comprobante: { buffer: Buffer.from("x"), extension: "jpg" },
      codigoReferido,
    });
    const orden = await obtenerOrdenPendientePropia(ticket.ordenId, comoSesion(organizadorId, "organizador"));

    // La aprobación en sí tiene que tener éxito, aunque el premio no se pueda emitir.
    await expect(aprobarOrden(orden, comoSesion(organizadorId, "organizador"))).resolves.toBeDefined();

    const [ordenAprobada] = await db.select().from(ordenes).where(eq(ordenes.id, ticket.ordenId));
    expect(ordenAprobada.estado).toBe("pagada");
    const [ticketAprobado] = await db.select().from(tickets).where(eq(tickets.id, ticket.id));
    expect(ticketAprobado.estado).toBe("disponible");

    const [premio] = await db.select().from(premiosReferidos).where(eq(premiosReferidos.programaId, programaId));
    expect(premio.estado).toBe("pendiente_stock");
    expect(premio.ticketCortesiaId).toBeNull();
  });

  it("una venta por debajo del monto mínimo del programa no cuenta para el umbral", async () => {
    const organizadorId = await crearUsuario({ rol: "organizador" });
    const eventoId = await crearEvento({ organizadorId });
    const tandaId = await crearTanda({ eventoId, precio: 1000, cantidadTotal: 20 });
    const tandaPremioId = await crearTanda({ eventoId, nombre: "Premio", precio: 0, cantidadTotal: 5 });
    const referidorId = await crearUsuario({ rol: "comprador", email: "vendedora6@test.com" });
    const codigoReferido = await obtenerOCrearCodigoReferido(referidorId);

    const programaId = await crearPrograma(comoSesion(organizadorId, "organizador"), {
      eventoId,
      nombre: "Con mínimo",
      ventasRequeridas: 1,
      tandaPremioId,
      montoMinimoVenta: 5000, // la tanda de 1000 nunca lo alcanza
    });

    const ticket = await comprarTicket(null, {
      ...datosBase,
      eventoId,
      tandaId,
      email: "compradora-bajo-minimo@test.com",
      comprobante: { buffer: Buffer.from("x"), extension: "jpg" },
      codigoReferido,
    });
    const orden = await obtenerOrdenPendientePropia(ticket.ordenId, comoSesion(organizadorId, "organizador"));
    await aprobarOrden(orden, comoSesion(organizadorId, "organizador"));

    const premios = await db.select().from(premiosReferidos).where(eq(premiosReferidos.programaId, programaId));
    expect(premios).toHaveLength(0);
  });

  it("concurrencia: N aprobaciones que cruzan el mismo umbral a la vez otorgan exactamente 1 premio", async () => {
    const organizadorId = await crearUsuario({ rol: "organizador" });
    const eventoId = await crearEvento({ organizadorId });
    const tandaId = await crearTanda({ eventoId, precio: 50000, cantidadTotal: 20 });
    const tandaPremioId = await crearTanda({ eventoId, nombre: "Premio", precio: 0, cantidadTotal: 10 });
    const referidorId = await crearUsuario({ rol: "comprador", email: "vendedora-concurrente@test.com" });
    const codigoReferido = await obtenerOCrearCodigoReferido(referidorId);

    const programaId = await crearPrograma(comoSesion(organizadorId, "organizador"), {
      eventoId,
      nombre: "Concurrencia",
      ventasRequeridas: 3,
      tandaPremioId,
    });

    // 3 órdenes pendientes, todas ya con su venta referida 'pendiente'.
    const ordenIds: number[] = [];
    for (let i = 0; i < 3; i++) {
      const ticket = await comprarTicket(null, {
        ...datosBase,
        eventoId,
        tandaId,
        email: `compradora-concurrente-${i}@test.com`,
        comprobante: { buffer: Buffer.from("x"), extension: "jpg" },
        codigoReferido,
      });
      ordenIds.push(ticket.ordenId);
    }

    // Las 3 se aprueban EN SIMULTÁNEO — las 3 cruzan el umbral de 3 ventas
    // al mismo tiempo, cada una viendo "todavía no se otorgó nada".
    await Promise.allSettled(
      ordenIds.map(async (ordenId) => {
        const orden = await obtenerOrdenPendientePropia(ordenId, comoSesion(organizadorId, "organizador"));
        await aprobarOrden(orden, comoSesion(organizadorId, "organizador"));
      }),
    );

    const premios = await db.select().from(premiosReferidos).where(eq(premiosReferidos.programaId, programaId));
    expect(premios).toHaveLength(1);
  });
});

describe("crearPrograma", () => {
  it("rechaza una tanda-premio de OTRO evento", async () => {
    const organizadorId = await crearUsuario({ rol: "organizador" });
    const eventoId = await crearEvento({ organizadorId });
    const otroEventoId = await crearEvento({ organizadorId });
    const tandaDeOtroEvento = await crearTanda({ eventoId: otroEventoId, precio: 0, cantidadTotal: 5 });

    await expect(
      crearPrograma(comoSesion(organizadorId, "organizador"), {
        eventoId,
        nombre: "Test",
        ventasRequeridas: 1,
        tandaPremioId: tandaDeOtroEvento,
      }),
    ).rejects.toThrow(ErrorNegocio);
  });
});
