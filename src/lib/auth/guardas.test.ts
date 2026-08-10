import { describe, expect, it } from "vitest";
import { eventoPropioODeSuperadmin, puedeEscanearEvento, staffPropio, tandaPropia, ErrorAutorizacion } from "@/lib/auth/guardas";
import { db } from "@/db/cliente";
import { staffEventos } from "@/db/esquema";
import { crearEvento, crearTanda, crearUsuario } from "@/test/fixtures";
import type { UsuarioSesion } from "@/lib/auth/sesion";

function comoSesion(id: number, rol: UsuarioSesion["rol"]): UsuarioSesion {
  return { id, rol, nombre: "Test", email: "test@test.com", telefono: null, cedula: null, estado: "activo", creadoEn: new Date() };
}

describe("eventoPropioODeSuperadmin", () => {
  it("el organizador dueño puede", async () => {
    const organizadorId = await crearUsuario({ rol: "organizador" });
    const eventoId = await crearEvento({ organizadorId });
    const evento = await eventoPropioODeSuperadmin(eventoId, comoSesion(organizadorId, "organizador"));
    expect(evento.id).toBe(eventoId);
  });

  it("un organizador que NO es el dueño no puede", async () => {
    const dueñoId = await crearUsuario({ rol: "organizador" });
    const otroId = await crearUsuario({ rol: "organizador" });
    const eventoId = await crearEvento({ organizadorId: dueñoId });
    await expect(eventoPropioODeSuperadmin(eventoId, comoSesion(otroId, "organizador"))).rejects.toThrow(
      ErrorAutorizacion,
    );
  });

  it("el superadmin puede sobre cualquier evento", async () => {
    const organizadorId = await crearUsuario({ rol: "organizador" });
    const eventoId = await crearEvento({ organizadorId });
    const evento = await eventoPropioODeSuperadmin(eventoId, comoSesion(999, "superadmin"));
    expect(evento.id).toBe(eventoId);
  });

  it("un evento inexistente tira ErrorAutorizacion", async () => {
    await expect(eventoPropioODeSuperadmin(999999, comoSesion(1, "superadmin"))).rejects.toThrow(ErrorAutorizacion);
  });
});

describe("tandaPropia", () => {
  it("delega en eventoPropioODeSuperadmin vía la tanda", async () => {
    const dueñoId = await crearUsuario({ rol: "organizador" });
    const otroId = await crearUsuario({ rol: "organizador" });
    const eventoId = await crearEvento({ organizadorId: dueñoId });
    const tandaId = await crearTanda({ eventoId });

    await expect(tandaPropia(tandaId, comoSesion(otroId, "organizador"))).rejects.toThrow(ErrorAutorizacion);
    const tanda = await tandaPropia(tandaId, comoSesion(dueñoId, "organizador"));
    expect(tanda.id).toBe(tandaId);
  });
});

describe("puedeEscanearEvento", () => {
  it("superadmin: siempre true", async () => {
    const organizadorId = await crearUsuario({ rol: "organizador" });
    const eventoId = await crearEvento({ organizadorId });
    expect(await puedeEscanearEvento(eventoId, comoSesion(999, "superadmin"))).toBe(true);
  });

  it("organizador: solo sus propios eventos", async () => {
    const dueñoId = await crearUsuario({ rol: "organizador" });
    const otroId = await crearUsuario({ rol: "organizador" });
    const eventoId = await crearEvento({ organizadorId: dueñoId });

    expect(await puedeEscanearEvento(eventoId, comoSesion(dueñoId, "organizador"))).toBe(true);
    expect(await puedeEscanearEvento(eventoId, comoSesion(otroId, "organizador"))).toBe(false);
  });

  it("staff: solo si está asignado en staff_eventos", async () => {
    const organizadorId = await crearUsuario({ rol: "organizador" });
    const eventoId = await crearEvento({ organizadorId });
    const staffId = await crearUsuario({ rol: "staff" });

    expect(await puedeEscanearEvento(eventoId, comoSesion(staffId, "staff"))).toBe(false);

    await db.insert(staffEventos).values({ staffId, eventoId });
    expect(await puedeEscanearEvento(eventoId, comoSesion(staffId, "staff"))).toBe(true);
  });

  it("comprador: nunca puede escanear", async () => {
    const organizadorId = await crearUsuario({ rol: "organizador" });
    const eventoId = await crearEvento({ organizadorId });
    const compradorId = await crearUsuario({ rol: "comprador" });
    expect(await puedeEscanearEvento(eventoId, comoSesion(compradorId, "comprador"))).toBe(false);
  });

  it("evento inexistente: false para cualquiera", async () => {
    expect(await puedeEscanearEvento(999999, comoSesion(1, "organizador"))).toBe(false);
  });
});

describe("staffPropio", () => {
  it("el organizador ve staff asignado a sus propios eventos", async () => {
    const organizadorId = await crearUsuario({ rol: "organizador" });
    const eventoId = await crearEvento({ organizadorId });
    const staffId = await crearUsuario({ rol: "staff" });
    await db.insert(staffEventos).values({ staffId, eventoId });

    const staff = await staffPropio(staffId, comoSesion(organizadorId, "organizador"));
    expect(staff.id).toBe(staffId);
  });

  it("el organizador NO ve staff de eventos ajenos", async () => {
    const dueñoId = await crearUsuario({ rol: "organizador" });
    const otroId = await crearUsuario({ rol: "organizador" });
    const eventoId = await crearEvento({ organizadorId: dueñoId });
    const staffId = await crearUsuario({ rol: "staff" });
    await db.insert(staffEventos).values({ staffId, eventoId });

    await expect(staffPropio(staffId, comoSesion(otroId, "organizador"))).rejects.toThrow(ErrorAutorizacion);
  });

  it("el superadmin ve cualquier staff por id, sin necesitar asignación", async () => {
    const staffId = await crearUsuario({ rol: "staff" });
    const staff = await staffPropio(staffId, comoSesion(999, "superadmin"));
    expect(staff.id).toBe(staffId);
  });
});
