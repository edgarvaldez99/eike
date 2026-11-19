import { describe, expect, it } from "vitest";
import { ErrorNegocio } from "@/lib/errores";
import { exigirContactoConfirmado, normalizarTelefonoPy } from "./telefono";

describe("normalizarTelefonoPy", () => {
  it.each([
    ["0981 123 456", "595981123456"],
    ["+595 981 123-456", "595981123456"],
    ["981123456", "595981123456"],
    ["595981123456", "595981123456"],
  ])("normaliza %s", (entrada, esperado) => {
    expect(normalizarTelefonoPy(entrada)).toBe(esperado);
  });

  it.each(["", "abc", "021 123 456", "09811234", "+54 9 11 1234 5678"])("rechaza %s", (entrada) => {
    expect(normalizarTelefonoPy(entrada)).toBeNull();
  });

  it("rechaza null y undefined", () => {
    expect(normalizarTelefonoPy(null)).toBeNull();
    expect(normalizarTelefonoPy(undefined)).toBeNull();
  });
});

describe("exigirContactoConfirmado", () => {
  it("devuelve el número normalizado si los dos coinciden (aunque estén escritos distinto)", () => {
    expect(exigirContactoConfirmado("0981 123 456", "+595981123456")).toBe("595981123456");
  });

  it("rechaza un número inválido, uno distinto o una confirmación vacía", () => {
    expect(() => exigirContactoConfirmado("123", "123")).toThrow(ErrorNegocio);
    expect(() => exigirContactoConfirmado(null, null)).toThrow(ErrorNegocio);
    expect(() => exigirContactoConfirmado("0981123456", "0981123457")).toThrow(/no coinciden/);
    expect(() => exigirContactoConfirmado("0981123456", null)).toThrow(ErrorNegocio);
  });
});
