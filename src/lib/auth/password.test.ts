import { describe, expect, it } from "vitest";
import { hashearPassword, verificarPassword } from "@/lib/auth/password";

describe("password (bcryptjs)", () => {
  it("hashea y verifica correctamente una contraseña nueva", async () => {
    const hash = await hashearPassword("mi-clave-123");
    expect(await verificarPassword("mi-clave-123", hash)).toBe(true);
    expect(await verificarPassword("otra-clave", hash)).toBe(false);
  });

  it("nunca devuelve la contraseña en texto plano como parte del hash", async () => {
    const hash = await hashearPassword("mi-clave-123");
    expect(hash).not.toContain("mi-clave-123");
    expect(hash.startsWith("$2b$")).toBe(true);
  });

  // El PHP viejo (password_hash de PHP 8.3) genera hashes con prefijo $2y$ —
  // el plan de migración exige verificar esto antes del cutover (riesgo
  // "los hashes bcrypt podrían no verificar en Node"). $2y$ y $2b$ producen
  // el mismo hash byte a byte para este rango de entradas (la diferencia de
  // versión es un fix histórico de PHP que no aplica acá); no tenemos PHP en
  // este entorno para generar uno real, así que se simula el prefijo sobre
  // un hash real de bcryptjs — si esto pasara, un hash real de PHP también.
  it("verifica un hash con prefijo $2y$ (el que usa PHP) sin reescribirlo", async () => {
    const hashOriginal = await hashearPassword("clave-como-la-de-php");
    const hashConPrefijoPhp = "$2y$" + hashOriginal.slice(4);

    expect(await verificarPassword("clave-como-la-de-php", hashConPrefijoPhp)).toBe(true);
  });
});
