import { describe, expect, it } from "vitest";
import { htmlATexto, normalizarMonto, parsearAvisoBanco, remitenteAutorizado } from "./parser-banco";

const ITAU = `Transferencia recibida
A continuación el detalle de la operación:
Nro. de operación:    BCNAPYPA080626637590121866944
Fecha y hora de operación:    08/06/2026 17:42:39
Cliente Pagador:    EDUARDO MANUEL VALDES FARIA
Nro. de cuenta del pagador:    412378561606
Entidad pagadora:    BANCO CONTINENTAL SAECA
Moneda y Monto:    PYG 724,000
Nro. de cuenta crédito:    0000000026523697
Nro. comprobante:    2946363
Concepto de la Transferencia:    MOTO
Estado:    Transferencia acreditada en cuenta`;

const FAMILIAR = `BANCO FAMILIAR
TRANSFERENCIA DE OTRAS ENTIDADES RECIBIDA
Nro. de Operación:    587908637
Referencia:    COMAPYPAARES260702424100003236149
Fecha y hora de Operación:    02/07/2026 13:59:19
Entidad Pagadora:    UENO BANK S.A.
Cliente Pagador:    EDGAR MOISESVALDEZ FARIA
Moneda y Monto:    PYG 3.614.000
Razón de comunicación:    Transferencia acreditada en cuenta.
Comentario del cliente:
`;

const UENO = `ueno bank
Recibiste una transferencia
Te compartimos el detalle de la operación.
Monto
Gs. 520.000
Entidad pagadora
BANCO ITAU PARAGUAY S.A.
Mensaje
Aviso
Transferencia acreditada en cuenta.
Fecha y hora transferencia
06/06/2026 02:02:10 h`;

describe("parsearAvisoBanco", () => {
  it("Itaú: monto con coma de miles, pagador, operación y concepto", () => {
    expect(parsearAvisoBanco(ITAU)).toEqual({
      banco: "Itaú",
      monto: 724000,
      pagador: "EDUARDO MANUEL VALDES FARIA",
      fecha: "08/06/2026 17:42:39",
      referencia: "MOTO",
      operacion: "BCNAPYPA080626637590121866944",
    });
  });

  it("Familiar: monto con punto de miles, y el comentario vacío no se traga la línea siguiente", () => {
    const aviso = parsearAvisoBanco(FAMILIAR);
    expect(aviso).toMatchObject({ banco: "Familiar", monto: 3614000, operacion: "587908637", referencia: null });
    expect(aviso?.pagador).toBe("EDGAR MOISESVALDEZ FARIA");
  });

  it("Familiar no se confunde con UENO aunque nombre 'UENO BANK' como pagador", () => {
    expect(parsearAvisoBanco(FAMILIAR)?.banco).toBe("Familiar");
  });

  it("Familiar real: texto cortado a 80 columnas con los campos corridos en un párrafo (datos ficticios)", () => {
    const real = `BANCO FAMILIAR
TRANSFERENCIA DE OTRAS ENTIDADES RECIBIDA
Hemos registrado la siguiente operación de transferencia

Nro. de Operación: 123456789 Referencia: UBBRPYPXARES2611160000012345 Fecha
y hora de Operación: 16/11/2026 20:30:30 Entidad Pagadora: BANCO ITAU PARAGUAY
S.A. Cliente Pagador: JUAN CARLOS PEREZ GOMEZ Nro. de Cuenta del Pagador:
****3697 Moneda y Monto: PYG 5.000 Entidad Beneficiaria: BANCO FAMILIAR
S.A.E.C.A. Cliente Beneficiario: Perez Gomez Juan Carlos Nro. de Cuenta del
Beneficiario: 81123742 Razón de comunicación: Transferencia acreditada en
cuenta. Comentario del cliente:

Te recordamos que nuestro Centro de Atención al Cliente se encuentra a tu entera
disposición; ante cualquier duda o consulta, podés llamar gratuítamente al 0800`;
    expect(parsearAvisoBanco(real)).toEqual({
      banco: "Familiar",
      monto: 5000,
      pagador: "JUAN CARLOS PEREZ GOMEZ",
      fecha: "16/11/2026 20:30:30",
      referencia: null, // el comentario vacío no se traga el pie del correo
      operacion: "123456789",
    });
  });

  it("Familiar con comentario escrito por el pagador", () => {
    const t = `BANCO FAMILIAR Nro. de Operación: 55 Moneda y Monto: PYG 80.000 Cliente Pagador: ANA Comentario del cliente: ORD-ABC123 Te recordamos que nuestro Centro`;
    expect(parsearAvisoBanco(t)).toMatchObject({ monto: 80000, referencia: "ORD-ABC123", pagador: "ANA", operacion: "55" });
  });

  it("UENO: etiqueta y valor en líneas separadas, solo monto y fecha", () => {
    expect(parsearAvisoBanco(UENO)).toEqual({
      banco: "UENO",
      monto: 520000,
      pagador: null,
      fecha: "06/06/2026 02:02:10",
      referencia: null,
      operacion: null,
    });
  });

  it("devuelve null para un correo que no es un aviso bancario", () => {
    expect(parsearAvisoBanco("Hola, ¿cómo estás? Te paso el link de la reunión.")).toBeNull();
  });
});

describe("normalizarMonto", () => {
  it("quita separadores y moneda", () => {
    expect(normalizarMonto("724,000")).toBe(724000);
    expect(normalizarMonto("3.614.000")).toBe(3614000);
    expect(normalizarMonto(null)).toBeNull();
    expect(normalizarMonto("abc")).toBeNull();
  });
});

describe("parsearAvisoBanco: datos faltantes", () => {
  const BASE_ITAU = `Concepto de la Transferencia:    MOTO
Cliente Pagador:    ANA
`;

  it("sin monto ni fecha ni operación devuelve esos campos en null (el aviso se registra igual)", () => {
    expect(parsearAvisoBanco(BASE_ITAU)).toEqual({
      banco: "Itaú",
      monto: null,
      pagador: "ANA",
      fecha: null,
      referencia: "MOTO",
      operacion: null,
    });
  });

  it("UENO sin monto ni fecha legibles devuelve null en ambos", () => {
    expect(parsearAvisoBanco(`ueno bank
Recibiste una transferencia`)).toMatchObject({
      banco: "UENO",
      monto: null,
      fecha: null,
    });
  });

  it("reconoce Itaú también por el Nº de comprobante junto a la cuenta crédito (sin 'Concepto')", () => {
    const aviso = parsearAvisoBanco(`Nro. comprobante:    2946363
Nro. de cuenta crédito:    0000000026523697`);
    expect(aviso).toMatchObject({ banco: "Itaú", operacion: "2946363" });
  });

  it("sin Nº de operación usa el Nº de comprobante como identificador", () => {
    expect(parsearAvisoBanco(`${BASE_ITAU}Nro. comprobante:    2946363
`)?.operacion).toBe("2946363");
  });
});

describe("htmlATexto", () => {
  it("conserva los saltos entre celdas/filas y decodifica entidades", () => {
    expect(htmlATexto("<tr><td>Monto</td></tr><tr><td>Gs.&nbsp;520.000</td></tr>")).toBe("Monto\nGs. 520.000");
  });
});

describe("remitenteAutorizado", () => {
  const permitidos = ["itau.com.py", "ueno.com.py", "operbancaweb@familiar.com.py"];
  it("acepta dominio exacto, subdominio y dirección exacta", () => {
    expect(remitenteAutorizado("info@itau.com.py", permitidos)).toBe(true);
    expect(remitenteAutorizado("no-reply@mails.ueno.com.py", permitidos)).toBe(true);
    expect(remitenteAutorizado("operbancaweb@familiar.com.py", permitidos)).toBe(true);
  });
  it("rechaza dominios parecidos o direcciones no listadas", () => {
    expect(remitenteAutorizado("info@itau.com.py.evil.com", permitidos)).toBe(false);
    expect(remitenteAutorizado("x@fakeitau.com.py", permitidos)).toBe(false);
    expect(remitenteAutorizado("otra@familiar.com.py", permitidos)).toBe(false);
    expect(remitenteAutorizado("alguien@gmail.com", permitidos)).toBe(false);
  });
  it("un dominio con @ inicial autoriza cualquier dirección de ese dominio", () => {
    expect(remitenteAutorizado("a@familiar.com.py", ["@familiar.com.py"])).toBe(true);
    expect(remitenteAutorizado("a@otro.com.py", ["@familiar.com.py"])).toBe(false);
  });
  it("ignora patrones vacíos o con solo espacios", () => {
    expect(remitenteAutorizado("info@itau.com.py", ["", "  "])).toBe(false);
    expect(remitenteAutorizado("info@itau.com.py", ["", "itau.com.py"])).toBe(true);
  });
  it("lista vacía no autoriza a nadie (falla cerrado)", () => {
    expect(remitenteAutorizado("info@itau.com.py", [])).toBe(false);
    expect(remitenteAutorizado("alguien@gmail.com", [])).toBe(false);
  });
});
