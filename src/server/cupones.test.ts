import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/cliente";
import { cupones, cuponUsos, ordenes, tickets } from "@/db/esquema";
import { comprarTicket } from "@/server/tickets";
import { crearCupon, previsualizarCupon } from "@/server/cupones";
import { ErrorNegocio } from "@/lib/errores";
import { crearCuponFixture, crearEvento, crearTanda, crearUsuario } from "@/test/fixtures";
import type { UsuarioSesion } from "@/lib/auth/sesion";

function comoSesion(id: number, rol: UsuarioSesion["rol"]): UsuarioSesion {
  return { id, rol, nombre: "Test", email: "test@test.com", telefono: null, cedula: null, estado: "activo", creadoEn: new Date(), codigoReferido: null, rucFacturacion: null, aliasBancarioTipo: null, aliasBancarioValor: null };
}

async function armarEventoConTanda(precio = 100000) {
  const organizadorId = await crearUsuario({ rol: "organizador" });
  const eventoId = await crearEvento({ organizadorId });
  const tandaId = await crearTanda({ eventoId, precio, cantidadTotal: 20 });
  return { organizadorId, eventoId, tandaId };
}

const datosBase = {
  nombreComprador: "Marta Ovelar",
  cedula: "4123456",
  contacto: "0981000000",
  asientoId: null,
  comprobanteTexto: null,
  codigoReferido: null,
};

describe("previsualizarCupon (solo lectura, no consume)", () => {
  it("cupón de porcentaje calcula el descuento correcto", async () => {
    const { organizadorId, eventoId, tandaId } = await armarEventoConTanda(100000);
    const codigo = await crearCuponFixture({ organizadorId, tipo: "porcentaje", valor: 20 }).then(
      async (id) => (await db.select().from(cupones).where(eq(cupones.id, id)))[0].codigo,
    );

    const previa = await previsualizarCupon({ eventoId, tandaId, codigo });
    expect(previa.descuento).toBe(20000);
    expect(previa.total).toBe(80000);
  });

  it("cupón de monto fijo nunca deja el total negativo (se acota al subtotal)", async () => {
    const { organizadorId, eventoId, tandaId } = await armarEventoConTanda(10000);
    const id = await crearCuponFixture({ organizadorId, tipo: "monto", valor: 999999 });
    const [{ codigo }] = await db.select().from(cupones).where(eq(cupones.id, id));

    const previa = await previsualizarCupon({ eventoId, tandaId, codigo });
    expect(previa.descuento).toBe(10000);
    expect(previa.total).toBe(0);
  });

  it("rechaza un cupón que no existe", async () => {
    const { eventoId, tandaId } = await armarEventoConTanda();
    await expect(previsualizarCupon({ eventoId, tandaId, codigo: "NOEXISTE" })).rejects.toThrow(ErrorNegocio);
  });

  it("rechaza un cupón de otro organizador", async () => {
    const { eventoId, tandaId } = await armarEventoConTanda();
    const otroOrganizadorId = await crearUsuario({ rol: "organizador" });
    const id = await crearCuponFixture({ organizadorId: otroOrganizadorId });
    const [{ codigo }] = await db.select().from(cupones).where(eq(cupones.id, id));

    await expect(previsualizarCupon({ eventoId, tandaId, codigo })).rejects.toThrow("no es válido");
  });

  it("rechaza un cupón atado a OTRO evento del mismo organizador", async () => {
    const { organizadorId, eventoId, tandaId } = await armarEventoConTanda();
    const otroEventoId = await crearEvento({ organizadorId });
    const id = await crearCuponFixture({ organizadorId, eventoId: otroEventoId });
    const [{ codigo }] = await db.select().from(cupones).where(eq(cupones.id, id));

    await expect(previsualizarCupon({ eventoId, tandaId, codigo })).rejects.toThrow("no es válido");
  });

  it("acepta un cupón 'todos mis eventos' (evento_id null) para cualquier evento del organizador", async () => {
    const { organizadorId, eventoId, tandaId } = await armarEventoConTanda(50000);
    const id = await crearCuponFixture({ organizadorId, eventoId: null, tipo: "porcentaje", valor: 10 });
    const [{ codigo }] = await db.select().from(cupones).where(eq(cupones.id, id));

    const previa = await previsualizarCupon({ eventoId, tandaId, codigo });
    expect(previa.descuento).toBe(5000);
  });

  it("rechaza si no se alcanza el monto mínimo de compra", async () => {
    const { organizadorId, eventoId, tandaId } = await armarEventoConTanda(10000);
    const id = await crearCuponFixture({ organizadorId, montoMinimo: 50000 });
    const [{ codigo }] = await db.select().from(cupones).where(eq(cupones.id, id));

    await expect(previsualizarCupon({ eventoId, tandaId, codigo })).rejects.toThrow("requiere una compra");
  });

  it("rechaza un cupón vencido", async () => {
    const { organizadorId, eventoId, tandaId } = await armarEventoConTanda();
    const id = await crearCuponFixture({ organizadorId, venceEn: new Date(Date.now() - 60_000) });
    const [{ codigo }] = await db.select().from(cupones).where(eq(cupones.id, id));

    await expect(previsualizarCupon({ eventoId, tandaId, codigo })).rejects.toThrow("venció");
  });

  it("rechaza un cupón desactivado", async () => {
    const { organizadorId, eventoId, tandaId } = await armarEventoConTanda();
    const id = await crearCuponFixture({ organizadorId, activo: false });
    const [{ codigo }] = await db.select().from(cupones).where(eq(cupones.id, id));

    await expect(previsualizarCupon({ eventoId, tandaId, codigo })).rejects.toThrow("activo");
  });
});

describe("crearCupon", () => {
  it("un cupón de 100% sin tope de usos se rechaza (riesgo de entradas gratis ilimitadas)", async () => {
    const organizadorId = await crearUsuario({ rol: "organizador" });
    await expect(
      crearCupon(comoSesion(organizadorId, "organizador"), {
        eventoId: undefined,
        codigo: "GRATIS100",
        tipo: "porcentaje",
        valor: 100,
      }),
    ).rejects.toThrow(ErrorNegocio);
  });

  it("un cupón de 100% CON tope de usos sí se puede crear", async () => {
    const organizadorId = await crearUsuario({ rol: "organizador" });
    const id = await crearCupon(comoSesion(organizadorId, "organizador"), {
      eventoId: undefined,
      codigo: "GRATIS100",
      tipo: "porcentaje",
      valor: 100,
      maxUsos: 5,
    });
    expect(id).toBeGreaterThan(0);
  });
});

describe("comprarTicket con cupón (consumo real, dentro de la transacción)", () => {
  it("aplica el descuento a la orden y al ticket, e incrementa cupones.usos", async () => {
    const { organizadorId, eventoId, tandaId } = await armarEventoConTanda(100000);
    const cuponId = await crearCuponFixture({ organizadorId, tipo: "porcentaje", valor: 20 });
    const [{ codigo }] = await db.select().from(cupones).where(eq(cupones.id, cuponId));

    const ticket = await comprarTicket(null, {
      ...datosBase,
      eventoId,
      tandaId,
      email: "comprador@test.com",
      comprobante: { buffer: Buffer.from("x"), extension: "jpg" },
      codigoCupon: codigo,
    });

    expect(ticket.precioUnitario).toBe(100000);
    expect(ticket.descuento).toBe(20000);
    expect(ticket.precioPagado).toBe(80000);

    const [orden] = await db.select().from(ordenes).where(eq(ordenes.id, ticket.ordenId));
    expect(orden.subtotal).toBe(100000);
    expect(orden.descuento).toBe(20000);
    expect(orden.total).toBe(80000);
    expect(orden.codigoCupon).toBe(codigo);

    const [cuponActualizado] = await db.select().from(cupones).where(eq(cupones.id, cuponId));
    expect(cuponActualizado.usos).toBe(1);

    const [uso] = await db.select().from(cuponUsos).where(eq(cuponUsos.cuponId, cuponId));
    expect(uso.montoDescontado).toBe(20000);
    expect(uso.ordenId).toBe(ticket.ordenId);
  });

  it("un cupón del 100% deja la compra gratis: sin comprobante, ticket 'disponible' directo", async () => {
    const { organizadorId, eventoId, tandaId } = await armarEventoConTanda(50000);
    const cuponId = await crearCuponFixture({
      organizadorId,
      tipo: "porcentaje",
      valor: 100,
      maxUsos: 10,
    });
    const [{ codigo }] = await db.select().from(cupones).where(eq(cupones.id, cuponId));

    const ticket = await comprarTicket(null, {
      ...datosBase,
      eventoId,
      tandaId,
      email: "gratis@test.com",
      comprobante: null,
      codigoCupon: codigo,
    });

    expect(ticket.estado).toBe("disponible");
    expect(ticket.reservadoHasta).toBeNull();
    expect(ticket.precioPagado).toBe(0);
  });

  it("un cupón agotado (max_usos ya alcanzado) hace fallar la compra entera, no cobra el precio lleno", async () => {
    const { organizadorId, eventoId, tandaId } = await armarEventoConTanda(100000);
    const cuponId = await crearCuponFixture({
      organizadorId,
      maxUsos: 1,
      usos: 1, // ya al límite
    });
    const [{ codigo }] = await db.select().from(cupones).where(eq(cupones.id, cuponId));

    await expect(
      comprarTicket(null, {
        ...datosBase,
        eventoId,
        tandaId,
        email: "tarde@test.com",
        comprobante: { buffer: Buffer.from("x"), extension: "jpg" },
        codigoCupon: codigo,
      }),
    ).rejects.toThrow("agotó");
  });

  it("respeta max_usos_por_comprador: el mismo email no puede reusar un cupón de 1 uso", async () => {
    const { organizadorId, eventoId, tandaId } = await armarEventoConTanda(50000);
    const cuponId = await crearCuponFixture({
      organizadorId,
      tipo: "porcentaje",
      valor: 10,
      maxUsosPorComprador: 1,
    });
    const [{ codigo }] = await db.select().from(cupones).where(eq(cupones.id, cuponId));

    await comprarTicket(null, {
      ...datosBase,
      eventoId,
      tandaId,
      email: "repetido@test.com",
      comprobante: { buffer: Buffer.from("x"), extension: "jpg" },
      codigoCupon: codigo,
    });

    await expect(
      comprarTicket(null, {
        ...datosBase,
        eventoId,
        tandaId,
        email: "REPETIDO@test.com", // mismo email, case-insensitive
        comprobante: { buffer: Buffer.from("x"), extension: "jpg" },
        codigoCupon: codigo,
      }),
    ).rejects.toThrow("máximo de veces");
  });

  it("concurrencia: cupón con max_usos=1, N compras simultáneas — exactamente 1 se descuenta, el resto falla", async () => {
    const { organizadorId, eventoId, tandaId } = await armarEventoConTanda(100000);
    const cuponId = await crearCuponFixture({
      organizadorId,
      tipo: "porcentaje",
      valor: 50,
      maxUsos: 1,
      maxUsosPorComprador: null, // sin este límite, para que la concurrencia solo la frene max_usos
    });
    const [{ codigo }] = await db.select().from(cupones).where(eq(cupones.id, cuponId));

    const resultados = await Promise.allSettled(
      Array.from({ length: 8 }, (_, i) =>
        comprarTicket(null, {
          ...datosBase,
          eventoId,
          tandaId,
          email: `concurrente-${i}@test.com`,
          comprobante: { buffer: Buffer.from("x"), extension: "jpg" },
          codigoCupon: codigo,
        }),
      ),
    );

    const exitosas = resultados.filter((r) => r.status === "fulfilled");
    expect(exitosas).toHaveLength(1);
    const ticketGanador = (exitosas[0] as PromiseFulfilledResult<Awaited<ReturnType<typeof comprarTicket>>>).value;
    expect(ticketGanador.descuento).toBe(50000);

    const [cuponFinal] = await db.select().from(cupones).where(eq(cupones.id, cuponId));
    expect(cuponFinal.usos).toBe(1);

    // Las 7 restantes NO se cobraron a precio lleno en silencio: fallaron entero.
    const ticketsCreados = await db.select().from(tickets).where(eq(tickets.tandaId, tandaId));
    expect(ticketsCreados).toHaveLength(1);
  });
});
