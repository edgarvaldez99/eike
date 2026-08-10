import { describe, expect, it } from "vitest";
import { zCasilla, zIdOpcional, zIdPositivo, zNumeroOpcional, zTextoOpcional } from "@/lib/validaciones/comun";

describe("zTextoOpcional", () => {
  const esquema = zTextoOpcional();

  it.each([null, undefined, ""])("normaliza %p a null (nunca string vacío)", (valor) => {
    expect(esquema.parse(valor)).toBeNull();
  });

  it("recorta espacios y conserva el valor real", () => {
    expect(esquema.parse("  hola  ")).toBe("hola");
  });
});

describe("zNumeroOpcional", () => {
  // Bug real documentado en comun.ts: un campo condicional que no se
  // renderiza en el form llega como null desde FormData.get(), no undefined
  // — si el preprocess no contempla los 3 casos (null/undefined/""), el
  // validador de abajo lo rechaza con un error confuso en vez de omitirlo.
  const esquema = zNumeroOpcional((s) => s.int().positive());

  it.each([null, undefined, ""])("un campo ausente (%p) no rompe la validación", (valor) => {
    expect(esquema.parse(valor)).toBeUndefined();
  });

  it("coerciona un string numérico real", () => {
    expect(esquema.parse("42")).toBe(42);
  });

  it("respeta las reglas extra (positive) cuando sí hay un valor", () => {
    expect(() => esquema.parse("-1")).toThrow();
    expect(() => esquema.parse("0")).toThrow();
  });
});

describe("zCasilla", () => {
  const esquema = zCasilla();

  it("'on' (como manda un checkbox HTML tildado) es true", () => {
    expect(esquema.parse("on")).toBe(true);
  });

  it.each([null, undefined, "", "off"])("cualquier otra cosa (%p) es false", (valor) => {
    expect(esquema.parse(valor)).toBe(false);
  });
});

describe("zIdPositivo", () => {
  it("acepta un id positivo (string o number)", () => {
    expect(zIdPositivo.parse("5")).toBe(5);
    expect(zIdPositivo.parse(5)).toBe(5);
  });

  it.each([0, -1, "0", "-3", 1.5])("rechaza %p", (valor) => {
    expect(() => zIdPositivo.parse(valor)).toThrow();
  });
});

describe("zIdOpcional", () => {
  const esquema = zIdOpcional();

  it.each([null, undefined, ""])("un asiento_id ausente (%p) no rompe la compra sin numerada", (valor) => {
    expect(esquema.parse(valor)).toBeUndefined();
  });

  it("un id real se coerciona a number positivo", () => {
    expect(esquema.parse("12")).toBe(12);
  });
});
