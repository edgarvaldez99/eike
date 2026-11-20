import { describe, expect, it } from "vitest";
import { avisoDesde, avisoEnVentana, fechaAvisoAIso, sumarMinutosIso } from "./fecha-aviso";

describe("fechaAvisoAIso", () => {
  it("convierte DD/MM/AAAA HH:MM(:SS) al formato de datetime-local", () => {
    expect(fechaAvisoAIso("19/11/2026 22:54:47")).toBe("2026-11-19T22:54");
    expect(fechaAvisoAIso("02/07/2026 13:59")).toBe("2026-07-02T13:59");
  });

  it("devuelve null si no se puede leer", () => {
    expect(fechaAvisoAIso(null)).toBeNull();
    expect(fechaAvisoAIso("ayer")).toBeNull();
  });
});

describe("avisoDesde", () => {
  it("sin fecha mínima acepta todo", () => {
    expect(avisoDesde("19/11/2026 22:54:47", "")).toBe(true);
  });

  it("acepta el mismo minuto o posterior, y rechaza lo anterior", () => {
    expect(avisoDesde("19/11/2026 22:54:47", "2026-11-19T22:54")).toBe(true);
    expect(avisoDesde("19/11/2026 22:55:00", "2026-11-19T22:54")).toBe(true);
    expect(avisoDesde("20/11/2026 00:01:00", "2026-11-19T22:54")).toBe(true);
    expect(avisoDesde("19/11/2026 22:33:57", "2026-11-19T22:54")).toBe(false);
    expect(avisoDesde("18/11/2026 23:59:59", "2026-11-19T00:00")).toBe(false);
  });

  it("un aviso sin fecha legible no se descarta", () => {
    expect(avisoDesde(null, "2026-11-19T22:54")).toBe(true);
  });
});

describe("sumarMinutosIso", () => {
  it("suma minutos cruzando hora, día y mes", () => {
    expect(sumarMinutosIso("2026-11-19T22:54", 5)).toBe("2026-11-19T22:59");
    expect(sumarMinutosIso("2026-11-19T22:58", 5)).toBe("2026-11-19T23:03");
    expect(sumarMinutosIso("2026-11-30T23:58", 5)).toBe("2026-12-01T00:03");
  });

  it("un valor que no es una fecha se devuelve igual", () => {
    expect(sumarMinutosIso("", 5)).toBe("");
  });
});

describe("avisoEnVentana", () => {
  const desde = "2026-11-19T22:54";

  it("acepta del minuto del comprobante hasta N minutos después, y rechaza lo anterior o lo posterior", () => {
    expect(avisoEnVentana("19/11/2026 22:54:47", desde, 5)).toBe(true);
    expect(avisoEnVentana("19/11/2026 22:59:10", desde, 5)).toBe(true);
    expect(avisoEnVentana("19/11/2026 23:00:00", desde, 5)).toBe(false);
    expect(avisoEnVentana("19/11/2026 22:33:57", desde, 5)).toBe(false);
  });

  it("al extender la ventana entran los más tardíos; sin límite entran todos los posteriores", () => {
    expect(avisoEnVentana("19/11/2026 23:30:00", desde, 60)).toBe(true);
    expect(avisoEnVentana("19/11/2026 23:30:00", desde, 5)).toBe(false);
    expect(avisoEnVentana("25/11/2026 09:00:00", desde, null)).toBe(true);
    expect(avisoEnVentana("19/11/2026 22:33:00", desde, null)).toBe(false);
  });

  it("sin fecha de inicio, o con un aviso sin fecha legible, no descarta nada", () => {
    expect(avisoEnVentana("19/11/2026 22:54:47", "", 5)).toBe(true);
    expect(avisoEnVentana(null, desde, 5)).toBe(true);
  });
});
