import { describe, expect, it } from "vitest";
import { coincidenciasPago, estaCorroborado, nombresCompatibles } from "./coincidencias";

describe("nombresCompatibles", () => {
  it("coincide sin importar el orden, los acentos ni las mayúsculas, con al menos dos palabras en común", () => {
    expect(nombresCompatibles("Eduardo Valdés", "VALDES FARIA EDUARDO MANUEL")).toBe(true);
  });

  it("una sola palabra en común (un apellido frecuente) no alcanza", () => {
    expect(nombresCompatibles("Ana Perez", "Juan Perez")).toBe(false);
  });

  it("las palabras muy cortas (de, la, y) no cuentan", () => {
    expect(nombresCompatibles("Ana de la Cruz", "Luis de la Vega")).toBe(false);
  });

  it("sin nombre de un lado o del otro, no hay coincidencia", () => {
    expect(nombresCompatibles(null, "ANA PEREZ")).toBe(false);
    expect(nombresCompatibles("ANA PEREZ", null)).toBe(false);
    expect(nombresCompatibles("", "ANA PEREZ")).toBe(false);
  });
});

describe("coincidenciasPago", () => {
  const comprobante = { monto: 50000, pagador: "ANA MARIA PEREZ", nroComprobante: "2946363" };
  const aviso = { monto: 50000, pagador: "PEREZ GOMEZ ANA", operacion: "OP-1", referencia: null };

  it("lista los campos que coinciden: monto y pagador", () => {
    expect(coincidenciasPago(comprobante, aviso)).toEqual(["monto", "pagador"]);
  });

  it("el Nº de comprobante coincide si es igual a la operación o a la referencia del aviso (sin distinguir formato)", () => {
    const sinPagador = { ...comprobante, pagador: null };
    expect(coincidenciasPago(sinPagador, { ...aviso, pagador: null, operacion: "2946363" })).toEqual(["monto", "comprobante"]);
    expect(coincidenciasPago(sinPagador, { ...aviso, pagador: null, operacion: null, referencia: "2946-363" })).toEqual(["monto", "comprobante"]);
  });

  it("nunca por 'contiene': un número que aparece dentro de otro más largo, o en un texto libre, no cuenta", () => {
    const sinPagador = { ...comprobante, pagador: null };
    expect(coincidenciasPago(sinPagador, { ...aviso, pagador: null, operacion: "BCNAPYPA2946363XYZ" })).toEqual(["monto"]);
    expect(coincidenciasPago(sinPagador, { ...aviso, pagador: null, referencia: "transf 2946363 gracias" })).toEqual(["monto"]);
  });

  it("un Nº corto o ausente no cuenta (evita coincidencias por casualidad)", () => {
    const corto = { ...comprobante, pagador: null, nroComprobante: "123" };
    expect(coincidenciasPago(corto, { ...aviso, pagador: null, operacion: "OP-123" })).toEqual(["monto"]);
    expect(coincidenciasPago({ ...corto, nroComprobante: null }, { ...aviso, pagador: null })).toEqual(["monto"]);
  });

  it("montos distintos o desconocidos no coinciden", () => {
    expect(coincidenciasPago(comprobante, { ...aviso, monto: 60000 })).toEqual(["pagador"]);
    expect(coincidenciasPago({ ...comprobante, monto: null }, { ...aviso, monto: null })).toEqual(["pagador"]);
  });
});

describe("estaCorroborado", () => {
  it("pide el monto y algún dato más", () => {
    expect(estaCorroborado(["monto", "pagador"])).toBe(true);
    expect(estaCorroborado(["monto", "comprobante"])).toBe(true);
    expect(estaCorroborado(["monto"])).toBe(false);
    expect(estaCorroborado(["pagador"])).toBe(false);
    expect(estaCorroborado([])).toBe(false);
  });

  it("cuenta destino y fecha: informativos (la cuenta se compara sin ceros; la fecha con 3 minutos de tolerancia)", () => {
    const c = { monto: 5000, pagador: null, nroComprobante: null, cuentaDestino: "81123742", fecha: "19/11/2026 22:54" };
    const a = { monto: 5000, pagador: null, operacion: null, referencia: null, cuentaDestino: "0081123742", fechaOperacion: "19/11/2026 22:56:30" };
    expect(coincidenciasPago(c, a)).toEqual(["monto", "cuenta", "fecha"]);
    expect(coincidenciasPago(c, { ...a, cuentaDestino: "999999", fechaOperacion: "19/11/2026 23:30:00" })).toEqual(["monto"]);
    expect(coincidenciasPago({ ...c, fecha: null, cuentaDestino: null }, a)).toEqual(["monto"]);
  });

  it("la cuenta y la fecha solas no corroboran el pago", () => {
    expect(estaCorroborado(["monto", "cuenta", "fecha"])).toBe(false);
    expect(estaCorroborado(["monto", "cuenta", "pagador"])).toBe(true);
  });
});
