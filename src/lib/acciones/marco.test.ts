import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ErrorNegocio } from "@/lib/errores";

// accionSegura() depende de requerirSesionAccion(), que a su vez lee cookies()
// de next/headers — no existe ese contexto de request fuera de un Server
// Action real. Para testear la lógica propia de accionSegura() en aislamiento
// (el gate de rol, el mapeo de errores, la validación Zod) se mockea el guard.
const { requerirSesionAccion } = vi.hoisted(() => ({ requerirSesionAccion: vi.fn() }));
vi.mock("@/lib/auth/guardas", async (importarOriginal) => {
  const original = await importarOriginal<typeof import("@/lib/auth/guardas")>();
  return { ...original, requerirSesionAccion };
});

const { accionSegura } = await import("@/lib/acciones/marco");
const { ErrorAutorizacion } = await import("@/lib/auth/guardas");

const usuarioDeTest = { id: 1, rol: "organizador" as const, estado: "activo" as const };
const esquema = z.object({ nombre: z.string().min(1) });

describe("accionSegura", () => {
  it("devuelve ok:true con los datos de ejecutar() cuando todo sale bien", async () => {
    requerirSesionAccion.mockResolvedValue(usuarioDeTest);
    const accion = accionSegura({
      esquema,
      ejecutar: async (datos) => `hola ${datos.nombre}`,
    });

    const resultado = await accion(null, { nombre: "Ana" });

    expect(resultado).toEqual({ ok: true, datos: "hola Ana" });
  });

  it("propaga ErrorAutorizacion del guard como ok:false (no revienta la action)", async () => {
    requerirSesionAccion.mockRejectedValue(new ErrorAutorizacion("No autorizado para esta acción."));
    const accion = accionSegura({ esquema, ejecutar: async () => "no debería llegar acá" });

    const resultado = await accion(null, { nombre: "Ana" });

    expect(resultado).toEqual({ ok: false, error: "No autorizado para esta acción." });
  });

  it("datos que no pasan el esquema Zod devuelven ok:false con el campo marcado", async () => {
    requerirSesionAccion.mockResolvedValue(usuarioDeTest);
    const accion = accionSegura({ esquema, ejecutar: async () => "no debería llegar acá" });

    const resultado = await accion(null, { nombre: "" });

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.campos).toHaveProperty("nombre");
    }
  });

  it("un ErrorNegocio de ejecutar() se muestra tal cual al usuario", async () => {
    requerirSesionAccion.mockResolvedValue(usuarioDeTest);
    const accion = accionSegura({
      esquema,
      ejecutar: async () => {
        throw new ErrorNegocio("Esa tanda está agotada.");
      },
    });

    const resultado = await accion(null, { nombre: "Ana" });

    expect(resultado).toEqual({ ok: false, error: "Esa tanda está agotada." });
  });

  it("un error inesperado se oculta detrás de un mensaje genérico", async () => {
    requerirSesionAccion.mockResolvedValue(usuarioDeTest);
    const accion = accionSegura({
      esquema,
      ejecutar: async () => {
        throw new Error("stack trace con detalles internos que no debe ver el usuario");
      },
    });

    const resultado = await accion(null, { nombre: "Ana" });

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.error).not.toContain("stack trace");
      expect(resultado.error).toBe("Ocurrió un error inesperado. Probá de nuevo.");
    }
  });

  it("acepta FormData además de un objeto plano", async () => {
    requerirSesionAccion.mockResolvedValue(usuarioDeTest);
    const accion = accionSegura({
      esquema,
      ejecutar: async (datos) => datos.nombre,
    });
    const fd = new FormData();
    fd.set("nombre", "Desde un form");

    const resultado = await accion(null, fd);

    expect(resultado).toEqual({ ok: true, datos: "Desde un form" });
  });
});
