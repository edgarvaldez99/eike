import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/cliente";
import { eventos } from "@/db/esquema";
import {
  aprobarEvento,
  editarEvento,
  rechazarEvento,
  solicitarAprobacionEvento,
} from "@/server/eventos";
import { crearTanda } from "@/server/tandas";
import { ErrorNegocio } from "@/lib/errores";
import { crearEvento, crearTanda as crearTandaFixture, crearUsuario } from "@/test/fixtures";
import type { EstadoEvento } from "@/lib/constantes";

async function releerEvento(eventoId: number) {
  const [fila] = await db.select().from(eventos).where(eq(eventos.id, eventoId));
  return fila;
}

const datosEditar = {
  nombre: "Evento editado",
  descripcion: null,
  fechaEvento: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  lugar: null,
  aforoTotal: null,
};

describe("solicitarAprobacionEvento (aprobación de eventos por superadmin, anti-estafa)", () => {
  it("borrador con al menos 1 tanda pasa a 'pendiente_aprobacion'", async () => {
    const organizadorId = await crearUsuario({ rol: "organizador" });
    const eventoId = await crearEvento({ organizadorId, estado: "borrador" });
    await crearTandaFixture({ eventoId });

    await solicitarAprobacionEvento(await releerEvento(eventoId));

    const evento = await releerEvento(eventoId);
    expect(evento.estado).toBe("pendiente_aprobacion");
  });

  it("rechaza un evento en borrador sin ninguna tanda", async () => {
    const organizadorId = await crearUsuario({ rol: "organizador" });
    const eventoId = await crearEvento({ organizadorId, estado: "borrador" });

    await expect(solicitarAprobacionEvento(await releerEvento(eventoId))).rejects.toThrow("al menos una tanda");
  });

  it("rechaza solicitar aprobación de un evento que no está en borrador ni rechazado", async () => {
    const organizadorId = await crearUsuario({ rol: "organizador" });
    const eventoId = await crearEvento({ organizadorId, estado: "publicado" });
    await crearTandaFixture({ eventoId });

    await expect(solicitarAprobacionEvento(await releerEvento(eventoId))).rejects.toThrow(ErrorNegocio);
  });

  it("un evento RECHAZADO puede volver a solicitar aprobación, y se limpia el motivo anterior", async () => {
    const organizadorId = await crearUsuario({ rol: "organizador" });
    const eventoId = await crearEvento({ organizadorId, estado: "rechazado" });
    await crearTandaFixture({ eventoId });
    await db.update(eventos).set({ motivoRechazo: "Afiche con contenido inapropiado" }).where(eq(eventos.id, eventoId));

    await solicitarAprobacionEvento(await releerEvento(eventoId));

    const evento = await releerEvento(eventoId);
    expect(evento.estado).toBe("pendiente_aprobacion");
    expect(evento.motivoRechazo).toBeNull();
  });
});

describe("aprobarEvento", () => {
  it("un evento pendiente pasa a 'publicado'", async () => {
    const organizadorId = await crearUsuario({ rol: "organizador" });
    const eventoId = await crearEvento({ organizadorId, estado: "pendiente_aprobacion" });

    await aprobarEvento(await releerEvento(eventoId));

    const evento = await releerEvento(eventoId);
    expect(evento.estado).toBe("publicado");
  });

  it("rechaza aprobar un evento que no está pendiente de aprobación", async () => {
    const organizadorId = await crearUsuario({ rol: "organizador" });
    const eventoId = await crearEvento({ organizadorId, estado: "borrador" });

    await expect(aprobarEvento(await releerEvento(eventoId))).rejects.toThrow(ErrorNegocio);
  });
});

describe("rechazarEvento", () => {
  it("guarda el motivo y pasa a 'rechazado'", async () => {
    const organizadorId = await crearUsuario({ rol: "organizador" });
    const eventoId = await crearEvento({ organizadorId, estado: "pendiente_aprobacion" });

    await rechazarEvento(await releerEvento(eventoId), "El afiche no coincide con el evento descrito.");

    const evento = await releerEvento(eventoId);
    expect(evento.estado).toBe("rechazado");
    expect(evento.motivoRechazo).toBe("El afiche no coincide con el evento descrito.");
  });

  it("rechaza rechazar (sic) un evento que no está pendiente de aprobación", async () => {
    const organizadorId = await crearUsuario({ rol: "organizador" });
    const eventoId = await crearEvento({ organizadorId, estado: "publicado" });

    await expect(rechazarEvento(await releerEvento(eventoId), "motivo")).rejects.toThrow(ErrorNegocio);
  });
});

describe("editarEvento — solo lectura fuera de borrador/rechazado", () => {
  const ESTADOS_EDITABLES: EstadoEvento[] = ["borrador", "rechazado"];
  const ESTADOS_SOLO_LECTURA: EstadoEvento[] = ["pendiente_aprobacion", "publicado", "cancelado", "finalizado"];

  it.each(ESTADOS_EDITABLES)("permite editar en estado '%s'", async (estado) => {
    const organizadorId = await crearUsuario({ rol: "organizador" });
    const eventoId = await crearEvento({ organizadorId, estado });

    await expect(editarEvento(await releerEvento(eventoId), datosEditar)).resolves.toBeUndefined();
    const evento = await releerEvento(eventoId);
    expect(evento.nombre).toBe("Evento editado");
  });

  it.each(ESTADOS_SOLO_LECTURA)("bloquea editar en estado '%s'", async (estado) => {
    const organizadorId = await crearUsuario({ rol: "organizador" });
    const eventoId = await crearEvento({ organizadorId, estado });

    await expect(editarEvento(await releerEvento(eventoId), datosEditar)).rejects.toThrow(ErrorNegocio);
  });
});

describe("crearTanda — mismo criterio de solo lectura (defensa en profundidad)", () => {
  it("permite crear una tanda en 'rechazado' (para que el organizador corrija y vuelva a solicitar)", async () => {
    const organizadorId = await crearUsuario({ rol: "organizador" });
    const eventoId = await crearEvento({ organizadorId, estado: "rechazado" });

    const resultado = await crearTanda(await releerEvento(eventoId), {
      eventoId,
      nombre: "General",
      tipo: "general",
      precio: 50000,
      cantidadTotal: 10,
    });
    expect(resultado.id).toBeGreaterThan(0);
  });

  it("bloquea crear una tanda en un evento 'pendiente_aprobacion'", async () => {
    const organizadorId = await crearUsuario({ rol: "organizador" });
    const eventoId = await crearEvento({ organizadorId, estado: "pendiente_aprobacion" });

    await expect(
      crearTanda(await releerEvento(eventoId), {
        eventoId,
        nombre: "General",
        tipo: "general",
        precio: 50000,
        cantidadTotal: 10,
      }),
    ).rejects.toThrow(ErrorNegocio);
  });

  it("bloquea crear una tanda en un evento ya 'publicado'", async () => {
    const organizadorId = await crearUsuario({ rol: "organizador" });
    const eventoId = await crearEvento({ organizadorId, estado: "publicado" });

    await expect(
      crearTanda(await releerEvento(eventoId), {
        eventoId,
        nombre: "General",
        tipo: "general",
        precio: 50000,
        cantidadTotal: 10,
      }),
    ).rejects.toThrow(ErrorNegocio);
  });
});
