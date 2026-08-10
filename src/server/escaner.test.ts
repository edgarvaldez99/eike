import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/cliente";
import { tickets } from "@/db/esquema";
import { validarTicket } from "@/server/escaner";
import { crearEvento, crearTanda, crearTicket, crearUsuario } from "@/test/fixtures";

async function armarTicket(estado: Parameters<typeof crearTicket>[0]["estado"] = "disponible") {
  const organizadorId = await crearUsuario({ rol: "organizador" });
  const eventoId = await crearEvento({ organizadorId });
  const tandaId = await crearTanda({ eventoId });
  const ticketId = await crearTicket({ eventoId, tandaId, estado });
  const [ticket] = await db.select().from(tickets).where(eq(tickets.id, ticketId));
  return { eventoId, tandaId, ticket };
}

describe("validarTicket", () => {
  it("un ticket disponible se marca 'usado' y devuelve ok", async () => {
    const { eventoId, ticket } = await armarTicket("disponible");

    const respuesta = await validarTicket(ticket.codigo, eventoId);

    expect(respuesta.resultado).toBe("ok");
    const [actualizado] = await db.select().from(tickets).where(eq(tickets.id, ticket.id));
    expect(actualizado.estado).toBe("usado");
    expect(actualizado.horaIngreso).not.toBeNull();
  });

  it("reescanear el mismo código devuelve 'ya_usado' con la hora del primer ingreso", async () => {
    const { eventoId, ticket } = await armarTicket("disponible");

    await validarTicket(ticket.codigo, eventoId);
    const segundo = await validarTicket(ticket.codigo, eventoId);

    expect(segundo.resultado).toBe("ya_usado");
    expect(segundo.mensaje).toContain("ya fue escaneada");
  });

  it("un código inexistente devuelve 'invalido' sin datos", async () => {
    const respuesta = await validarTicket("EIK-NO-EXISTE-XYZ", 1);
    expect(respuesta.resultado).toBe("invalido");
    expect(respuesta.datos).toBeUndefined();
  });

  it("un ticket anulado devuelve 'anulado'", async () => {
    const { eventoId, ticket } = await armarTicket("anulado");
    const respuesta = await validarTicket(ticket.codigo, eventoId);
    expect(respuesta.resultado).toBe("anulado");
  });

  it("un ticket pendiente de aprobación devuelve 'pendiente'", async () => {
    const { eventoId, ticket } = await armarTicket("pendiente");
    const respuesta = await validarTicket(ticket.codigo, eventoId);
    expect(respuesta.resultado).toBe("pendiente");
  });

  it("un código de otro evento devuelve 'invalido'", async () => {
    const { ticket } = await armarTicket("disponible");
    const respuesta = await validarTicket(ticket.codigo, 999999);
    expect(respuesta.resultado).toBe("invalido");
    expect(respuesta.mensaje).toContain("no es de este evento");
  });

  it("concurrencia real: 15 validaciones simultáneas del mismo código solo dejan pasar 1 'ok'", async () => {
    const { eventoId, ticket } = await armarTicket("disponible");

    const respuestas = await Promise.all(
      Array.from({ length: 15 }, () => validarTicket(ticket.codigo, eventoId)),
    );

    const oks = respuestas.filter((r) => r.resultado === "ok");
    const yaUsados = respuestas.filter((r) => r.resultado === "ya_usado");
    expect(oks).toHaveLength(1);
    expect(yaUsados).toHaveLength(14);
  });
});
