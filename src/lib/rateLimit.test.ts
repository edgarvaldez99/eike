import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { limitar, reiniciarLimitesParaTests } from "@/lib/rateLimit";

describe("limitar", () => {
  beforeEach(() => {
    reiniciarLimitesParaTests();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("permite hasta el máximo configurado dentro de la ventana", () => {
    for (let i = 0; i < 5; i++) {
      expect(limitar("clave-a", { maximo: 5, ventanaMs: 60_000 }).permitido).toBe(true);
    }
  });

  it("bloquea el intento que excede el máximo", () => {
    for (let i = 0; i < 5; i++) limitar("clave-b", { maximo: 5, ventanaMs: 60_000 });
    const resultado = limitar("clave-b", { maximo: 5, ventanaMs: 60_000 });
    expect(resultado.permitido).toBe(false);
    expect(resultado.reintentarEnSegundos).toBeGreaterThan(0);
  });

  it("claves distintas no se pisan entre sí", () => {
    for (let i = 0; i < 5; i++) limitar("clave-c", { maximo: 5, ventanaMs: 60_000 });
    expect(limitar("clave-c", { maximo: 5, ventanaMs: 60_000 }).permitido).toBe(false);
    expect(limitar("clave-d", { maximo: 5, ventanaMs: 60_000 }).permitido).toBe(true);
  });

  it("al vencer la ventana, el contador se reinicia", () => {
    for (let i = 0; i < 5; i++) limitar("clave-e", { maximo: 5, ventanaMs: 60_000 });
    expect(limitar("clave-e", { maximo: 5, ventanaMs: 60_000 }).permitido).toBe(false);

    vi.advanceTimersByTime(60_001);

    expect(limitar("clave-e", { maximo: 5, ventanaMs: 60_000 }).permitido).toBe(true);
  });
});
