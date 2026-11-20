import { describe, expect, it } from "vitest";
import { extraerCuentaDestino, extraerFechaComprobante, parsearComprobanteOcr } from "./parser-comprobante";

// Texto que devolvió OCR.space sobre un comprobante real de ueno (poc/README.md).
const UENO = `ueno bank · Comprobante de transferencia
Nro. de comprobante: 2607093255696 · 09/07/2026 19:24 · GS. 10.000
DE: EDGAR MOISES VALDEZ FARIA (Caja de ahorro 6191655117, ueno bank)
PARA: Edgar Moises Valdez Faria (Nro. 26523697, BANCO ITAU PARAGUAY S.A.)
Concepto: pago tiquetero`;

describe("parsearComprobanteOcr", () => {
  it("extrae banco, monto, comprobante, pagador, beneficiario y concepto de un comprobante de ueno", () => {
    const d = parsearComprobanteOcr(UENO);
    expect(d.banco).toBe("ueno");
    expect(d.monto).toBe(10000);
    expect(d.nro).toBe("2607093255696");
    expect(d.concepto).toBe("pago tiquetero");
    expect(d.pagador).toContain("EDGAR MOISES VALDEZ FARIA");
    expect(d.beneficiario).toContain("BANCO ITAU PARAGUAY");
    expect(d.beneficiario).not.toContain("pago tiquetero");
  });

  it("soporta bloques DE/PARA con el valor en la línea siguiente", () => {
    const d = parsearComprobanteOcr(`Comprobante\nPYG 150.000\nDE\nJUAN PEREZ\nBanco Familiar\n\nPARA\nEIKE EAS\nBANCO ITAU\n\nConcepto: EIK-123`);
    expect(d.monto).toBe(150000);
    expect(d.banco).toBe("Familiar"); // banco emisor (bloque DE); Itaú es el del beneficiario
    expect(d.pagador).toBe("JUAN PEREZ Banco Familiar");
    expect(d.beneficiario).toBe("EIKE EAS BANCO ITAU");
    expect(d.concepto).toBe("EIK-123");
  });

  it("app de Itaú (OCR real): banco emisor aunque lea 'itaü', Nº de comprobante en la línea de abajo y bloque 'para' acotado", () => {
    // Estructura de un comprobante real mandado por WhatsApp (nombres y números ficticios).
    const d = parsearComprobanteOcr(`Sip
itaü
comprobante de transferencia
Gs. 5.000
para
Pérez Gómez
Juan Carlos
BANCO FAMILIAR
S.A.E.C.A.
cuenta en
guaraníes
nº 81123742
número de comprobante
2593738
realizada el 16 nov 2026 a las 20:30 hs`);
    expect(d.banco).toBe("Itaú"); // no "Familiar": ese es el banco del beneficiario
    expect(d.monto).toBe(5000);
    expect(d.nro).toBe("2593738");
    expect(d.pagador).toBeNull();
    expect(d.beneficiario).toBe("Pérez Gómez Juan Carlos BANCO FAMILIAR S.A.E.C.A.");
    expect(d.concepto).toBeNull();
    expect(d.cuentaDestino).toBe("81123742");
    expect(d.fecha).toBe("16/11/2026 20:30");
  });

  it("un texto que no es un comprobante devuelve todo en null", () => {
    expect(parsearComprobanteOcr("foto de un perro")).toEqual({
      banco: null, monto: null, concepto: null, nro: null, pagador: null, beneficiario: null, cuentaDestino: null, fecha: null,
    });
  });

  it("captura de otra app (mango): fecha con guion y cuenta con 'Cta. N°' (datos ficticios)", () => {
    const d = parsearComprobanteOcr(`Monto
Gs. 50
EDGAR MOISES VALDEZ FARIA
BANCO FAMILIAR S.A.E.C.A.
Cta. N° 81123742
Origen
Guillermo David Gonzalez Encina
TU FINANCIERA
Cta. N° ----680
Fecha y hora
19 nov 2026 - 22:54 Hs
Estado
Procesando transferencia`);
    expect(d.monto).toBe(50);
    expect(d.cuentaDestino).toBe("81123742");
    expect(d.fecha).toBe("19/11/2026 22:54");
  });
});

describe("extraerFechaComprobante", () => {
  it("acepta mes en letras (con o sin punto, 'set' o 'sep') y fecha numérica", () => {
    expect(extraerFechaComprobante("3 set. 2026 a las 9:05 hs")).toBe("03/09/2026 09:05");
    expect(extraerFechaComprobante("realizada el 16/11/2026 20:30")).toBe("16/11/2026 20:30");
  });

  it("sin hora o sin fecha devuelve null", () => {
    expect(extraerFechaComprobante("16 nov 2026")).toBeNull();
    expect(extraerFechaComprobante("hola")).toBeNull();
  });
});

describe("extraerCuentaDestino", () => {
  it("sin cuenta de 5+ dígitos devuelve null, y ignora las enmascaradas", () => {
    expect(extraerCuentaDestino("Cta. N° ----680")).toBeNull();
    expect(extraerCuentaDestino("nada")).toBeNull();
  });

  it("sin bloque PARA toma la primera cuenta del texto", () => {
    expect(extraerCuentaDestino("cuenta nro: 123456")).toBe("123456");
  });

});
