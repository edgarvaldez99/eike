import { describe, expect, it } from "vitest";
import { esquemaEditarCorreoReenvioBanco } from "./cuenta";

describe("esquemaEditarCorreoReenvioBanco", () => {
  it("acepta un email y lo guarda en minúsculas", () => {
    expect(esquemaEditarCorreoReenvioBanco.parse({ correo_reenvio_banco: "  Empresa@Test.com " })).toEqual({
      correo_reenvio_banco: "empresa@test.com",
    });
  });

  it("vacío significa dejar de reenviar (null)", () => {
    expect(esquemaEditarCorreoReenvioBanco.parse({ correo_reenvio_banco: "  " })).toEqual({ correo_reenvio_banco: null });
  });

  it("rechaza algo que no es un email o es demasiado largo", () => {
    expect(esquemaEditarCorreoReenvioBanco.safeParse({ correo_reenvio_banco: "no-es-email" }).success).toBe(false);
    expect(esquemaEditarCorreoReenvioBanco.safeParse({ correo_reenvio_banco: `${"a".repeat(150)}@test.com` }).success).toBe(false);
  });
});
