import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/cliente";
import { usuarios } from "@/db/esquema";
import {
  aprobarOrganizador,
  editarOrganizador,
  inactivarOrganizador,
  reactivarOrganizador,
  rechazarOrganizador,
  registrarComprador,
} from "@/server/usuarios";
import { crearUsuario } from "@/test/fixtures";
import { ErrorNegocio } from "@/lib/errores";

describe("registrarComprador", () => {
  it("crea el comprador ya activo (sin aprobación)", async () => {
    const id = await registrarComprador({
      nombre: "Diego Ayala",
      email: "diego@test.com",
      password: "test1234",
      telefono: null,
      cedula: "4423456",
    });

    const [fila] = await db.select().from(usuarios).where(eq(usuarios.id, id));
    expect(fila.estado).toBe("activo");
    expect(fila.rol).toBe("comprador");
  });

  it("rechaza un email duplicado sin distinguir mayúsculas/minúsculas", async () => {
    await registrarComprador({
      nombre: "Diego Ayala",
      email: "Diego@Test.com",
      password: "test1234",
      telefono: null,
      cedula: null,
    });

    await expect(
      registrarComprador({
        nombre: "Otro Diego",
        email: "diego@test.com",
        password: "otra-clave",
        telefono: null,
        cedula: null,
      }),
    ).rejects.toThrow(ErrorNegocio);
  });
});

describe("estados de organizador (aprobar / rechazar / inactivar / reactivar)", () => {
  it("aprueba un organizador pendiente de aprobación", async () => {
    const id = await crearUsuario({ rol: "organizador", estado: "pendiente_aprobacion" });
    await aprobarOrganizador(id);
    const [fila] = await db.select().from(usuarios).where(eq(usuarios.id, id));
    expect(fila.estado).toBe("activo");
  });

  it("aprobar también funciona sobre uno ya rechazado, y limpia el motivo", async () => {
    const id = await crearUsuario({ rol: "organizador", estado: "rechazado" });
    await db.update(usuarios).set({ motivoRechazo: "Documentación incompleta" }).where(eq(usuarios.id, id));

    await aprobarOrganizador(id);

    const [fila] = await db.select().from(usuarios).where(eq(usuarios.id, id));
    expect(fila.estado).toBe("activo");
    expect(fila.motivoRechazo).toBeNull();
  });

  it("no se puede aprobar un organizador ya activo", async () => {
    const id = await crearUsuario({ rol: "organizador", estado: "activo" });
    await expect(aprobarOrganizador(id)).rejects.toThrow(ErrorNegocio);
  });

  it("rechaza un organizador pendiente con el motivo tal cual (UTF-8 incluido)", async () => {
    const id = await crearUsuario({ rol: "organizador", estado: "pendiente_aprobacion" });
    await rechazarOrganizador(id, "Documentación incompleta");

    const [fila] = await db.select().from(usuarios).where(eq(usuarios.id, id));
    expect(fila.estado).toBe("rechazado");
    expect(fila.motivoRechazo).toBe("Documentación incompleta");
  });

  it("no se puede rechazar un organizador que no está pendiente", async () => {
    const id = await crearUsuario({ rol: "organizador", estado: "activo" });
    await expect(rechazarOrganizador(id, "motivo")).rejects.toThrow(ErrorNegocio);
  });

  it("inactivar funciona desde cualquier estado previo salvo inexistente", async () => {
    const id = await crearUsuario({ rol: "organizador", estado: "activo" });
    await inactivarOrganizador(id);
    const [fila] = await db.select().from(usuarios).where(eq(usuarios.id, id));
    expect(fila.estado).toBe("inactivo");
  });

  it("reactivar solo funciona sobre un organizador inactivo", async () => {
    const activoId = await crearUsuario({ rol: "organizador", estado: "activo" });
    await expect(reactivarOrganizador(activoId)).rejects.toThrow(ErrorNegocio);

    const inactivoId = await crearUsuario({ rol: "organizador", estado: "inactivo" });
    await reactivarOrganizador(inactivoId);
    const [fila] = await db.select().from(usuarios).where(eq(usuarios.id, inactivoId));
    expect(fila.estado).toBe("activo");
  });

  it("editarOrganizador actualiza solo los campos provistos", async () => {
    const id = await crearUsuario({ rol: "organizador", nombre: "Nombre Original" });
    await editarOrganizador(id, { telefono: "0981000000" });

    const [fila] = await db.select().from(usuarios).where(eq(usuarios.id, id));
    expect(fila.nombre).toBe("Nombre Original");
    expect(fila.telefono).toBe("0981000000");
  });

  it("las acciones de organizador tiran ErrorNegocio si el id no existe o no es organizador", async () => {
    const compradorId = await crearUsuario({ rol: "comprador" });
    await expect(aprobarOrganizador(999999)).rejects.toThrow(ErrorNegocio);
    await expect(aprobarOrganizador(compradorId)).rejects.toThrow(ErrorNegocio);
  });
});
