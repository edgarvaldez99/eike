import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { firmaValida } from "./firma";

const secreto = "secreto-de-prueba";
const cuerpo = '{"entry":[]}';
const firmar = (c: string, s: string) => `sha256=${createHmac("sha256", s).update(c).digest("hex")}`;

describe("firmaValida", () => {
  it("acepta la firma correcta de Meta", () => {
    expect(firmaValida(cuerpo, firmar(cuerpo, secreto), secreto)).toBe(true);
  });
  it("rechaza cuerpo alterado, secreto distinto, cabecera ausente o malformada", () => {
    expect(firmaValida(cuerpo + " ", firmar(cuerpo, secreto), secreto)).toBe(false);
    expect(firmaValida(cuerpo, firmar(cuerpo, "otro"), secreto)).toBe(false);
    expect(firmaValida(cuerpo, null, secreto)).toBe(false);
    expect(firmaValida(cuerpo, "sha256=abc", secreto)).toBe(false);
  });
});
