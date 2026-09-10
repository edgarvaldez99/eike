import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/cliente";
import { usuarios } from "@/db/esquema";
import { cambiarPasswordPropio, editarAliasBancario, editarPerfilPropio } from "@/server/cuenta";
import { hashearPassword, verificarPassword } from "@/lib/auth/password";
import { ErrorNegocio } from "@/lib/errores";
import { crearUsuario } from "@/test/fixtures";

async function releerUsuario(id: number) {
  const [fila] = await db.select().from(usuarios).where(eq(usuarios.id, id));
  return fila;
}

describe("editarPerfilPropio", () => {
  it("actualiza nombre, email, teléfono y cédula", async () => {
    const id = await crearUsuario({ rol: "comprador" });

    await editarPerfilPropio(id, {
      nombre: "Nuevo Nombre",
      email: "nuevo@test.com",
      telefono: "0981111111",
      cedula: "1234567",
    });

    const usuario = await releerUsuario(id);
    expect(usuario.nombre).toBe("Nuevo Nombre");
    expect(usuario.email).toBe("nuevo@test.com");
    expect(usuario.telefono).toBe("0981111111");
    expect(usuario.cedula).toBe("1234567");
  });

  it("rechaza un email que ya usa otra cuenta (constraint, mismo criterio que registrarComprador)", async () => {
    await crearUsuario({ rol: "comprador", email: "ocupado@test.com" });
    const id = await crearUsuario({ rol: "comprador", email: "libre@test.com" });

    await expect(
      editarPerfilPropio(id, { nombre: "X", email: "ocupado@test.com", telefono: null, cedula: null }),
    ).rejects.toThrow();
  });
});

describe("cambiarPasswordPropio", () => {
  it("cambia la contraseña cuando la actual es correcta", async () => {
    const id = await crearUsuario({ rol: "comprador", password: "ViejaPass1" });

    await cambiarPasswordPropio(id, "ViejaPass1", "NuevaPass1");

    const usuario = await releerUsuario(id);
    expect(await verificarPassword("NuevaPass1", usuario.passwordHash)).toBe(true);
    expect(await verificarPassword("ViejaPass1", usuario.passwordHash)).toBe(false);
  });

  it("rechaza si la contraseña actual es incorrecta, sin tocar el hash", async () => {
    const id = await crearUsuario({ rol: "comprador", password: "ViejaPass1" });
    const antes = await releerUsuario(id);

    await expect(cambiarPasswordPropio(id, "Incorrecta", "NuevaPass1")).rejects.toThrow(ErrorNegocio);

    const despues = await releerUsuario(id);
    expect(despues.passwordHash).toBe(antes.passwordHash);
  });
});

describe("editarAliasBancario", () => {
  it("guarda el tipo y el valor del alias", async () => {
    const id = await crearUsuario({ rol: "superadmin" });

    await editarAliasBancario(id, { tipo: "cedula", valor: "1234567" });

    const usuario = await releerUsuario(id);
    expect(usuario.aliasBancarioTipo).toBe("cedula");
    expect(usuario.aliasBancarioValor).toBe("1234567");
  });

  it("permite pisar un alias ya cargado con otro tipo/valor", async () => {
    const id = await crearUsuario({ rol: "superadmin" });
    await editarAliasBancario(id, { tipo: "telefono", valor: "0981000000" });

    await editarAliasBancario(id, { tipo: "correo", valor: "pagos@eike.com.py" });

    const usuario = await releerUsuario(id);
    expect(usuario.aliasBancarioTipo).toBe("correo");
    expect(usuario.aliasBancarioValor).toBe("pagos@eike.com.py");
  });
});

// Cordura del hasheo usado por cambiarPasswordPropio — ya cubierto en otro
// lado, pero un smoke test acá no está de más dado lo sensible del flujo.
describe("hashearPassword/verificarPassword (smoke)", () => {
  it("un hash nuevo verifica contra su propio texto plano", async () => {
    const hash = await hashearPassword("UnaPassword1");
    expect(await verificarPassword("UnaPassword1", hash)).toBe(true);
    expect(await verificarPassword("OtraPassword", hash)).toBe(false);
  });
});
