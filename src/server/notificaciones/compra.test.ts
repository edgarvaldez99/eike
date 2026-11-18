import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db/cliente";
import { usuarios } from "@/db/esquema";
import { eq } from "drizzle-orm";
import { crearEvento, crearOrden, crearTanda, crearTicket, crearUsuario } from "@/test/fixtures";

const enviar = vi.hoisted(() => vi.fn());
vi.mock("./correo-compra", () => ({ enviarCorreoCompra: enviar }));

import { notificarResultadoCompra } from "./compra";

const comprador = { codigo: "ORD-ABCDEF123456", nombreComprador: "Ana", email: "ana@example.com" };

describe("notificarResultadoCompra", () => {
  beforeEach(() => {
    enviar.mockReset();
    enviar.mockResolvedValue("enviado");
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("manda el correo con el evento de la compra y el WhatsApp de la plataforma", async () => {
    const superadminId = await crearUsuario({ rol: "superadmin" });
    await db.update(usuarios).set({ numeroWhatsapp: "+595991258700" }).where(eq(usuarios.id, superadminId));
    const organizadorId = await crearUsuario({ rol: "organizador" });
    const eventoId = await crearEvento({ organizadorId, nombre: "Festival" });
    const tandaId = await crearTanda({ eventoId });
    const ordenId = await crearOrden({ organizadorId, codigo: comprador.codigo });
    await crearTicket({ eventoId, tandaId, ordenId, estado: "pendiente" });

    await notificarResultadoCompra(comprador, "aprobada");

    expect(enviar).toHaveBeenCalledWith({
      ...comprador,
      eventoNombre: "Festival",
      resultado: "aprobada",
      numeroWhatsapp: "+595991258700",
    });
  });

  it("si no encuentra la compra ni hay número cargado, igual avisa con un nombre genérico de evento", async () => {
    await notificarResultadoCompra(comprador, "rechazada");

    expect(enviar).toHaveBeenCalledWith({ ...comprador, eventoNombre: "tu evento", resultado: "rechazada", numeroWhatsapp: null });
  });

  it("si el envío falla no lanza: solo deja el error en el log", async () => {
    const logError = vi.spyOn(console, "error").mockImplementation(() => {});
    enviar.mockRejectedValue(new Error("SMTP caído"));

    await expect(notificarResultadoCompra(comprador, "aprobada")).resolves.toBeUndefined();

    expect(logError).toHaveBeenCalledWith(expect.stringContaining("ORD-ABCDEF123456"), expect.any(Error));
  });
});
