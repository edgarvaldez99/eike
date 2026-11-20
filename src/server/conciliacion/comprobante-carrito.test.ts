import { afterEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/cliente";
import { comprobantesWhatsapp } from "@/db/esquema";
import { crearOrden, crearUsuario } from "@/test/fixtures";
import { registrarAviso } from "./avisos";
import * as comprobantes from "./comprobantes";
import { procesarComprobanteCarrito, type ComprobanteDeCarrito } from "./comprobante-carrito";

// Texto con la estructura de una captura real (datos ficticios), como lo devuelve el OCR.
const OCR_MANGO = `Monto
Gs. 50
EDGAR MOISES VALDEZ FARIA
BANCO FAMILIAR S.A.E.C.A.
Cta. N° 81123742
Origen
Guillermo David Gonzalez Encina
TU FINANCIERA
Cta. N° ----680
Fecha y hora
19 nov 2026 - 22:54 Hs`;

const OCR_ITAU = `Sip
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
realizada el 19 nov 2026 a las 22:54 hs`;

async function compra(total: number) {
  const organizadorId = await crearUsuario({ rol: "organizador" });
  const ordenId = await crearOrden({ organizadorId, estado: "pendiente", subtotal: total });
  const comprobante: ComprobanteDeCarrito = {
    ordenId,
    codigoOrden: `ORD-T${ordenId}`,
    total,
    nombreComprador: "Comprador",
    contacto: "595961746430",
    archivo: `ORD-T${ordenId}.jpg`,
    buffer: Buffer.from("imagen"),
    extension: "jpg",
  };
  return comprobante;
}
const ocrCon = (texto: string) => ({ ocr: vi.fn(async () => texto) });
const filas = () => db.select().from(comprobantesWhatsapp);

afterEach(() => vi.restoreAllMocks());

describe("procesarComprobanteCarrito", () => {
  it("lee la foto con OCR y la registra con todos sus datos, atada a la compra y con origen 'carrito'", async () => {
    const c = await compra(5000);
    const deps = ocrCon(OCR_ITAU);
    await procesarComprobanteCarrito(c, deps);

    expect(deps.ocr).toHaveBeenCalledWith(c.buffer, "image/jpeg", c.archivo);
    const [fila] = await filas();
    expect(fila).toMatchObject({
      origen: "carrito",
      ordenId: c.ordenId,
      waMessageId: `carrito:${c.codigoOrden}`,
      waFrom: "595961746430",
      archivo: c.archivo,
      banco: "Itaú",
      monto: 5000,
      nroComprobante: "2593738",
      cuentaDestino: "81123742",
      fechaOperacion: "19/11/2026 22:54",
      estado: "pendiente_banco",
      avisoId: null,
      coincidencias: null,
    });
    expect(fila.textoOcr).toContain("comprobante de transferencia");
  });

  it("es idempotente: procesar dos veces la misma compra no duplica el registro", async () => {
    const c = await compra(5000);
    await procesarComprobanteCarrito(c, ocrCon(OCR_ITAU));
    await procesarComprobanteCarrito(c, ocrCon(OCR_ITAU));
    expect(await filas()).toHaveLength(1);
  });

  it("si el monto de la foto no es el de la compra, queda observado con el motivo (pagó de menos)", async () => {
    const c = await compra(5000);
    await procesarComprobanteCarrito(c, ocrCon(OCR_MANGO)); // la foto dice Gs. 50
    const [fila] = await filas();
    expect(fila.estado).toBe("observado");
    expect(fila.monto).toBe(50);
    expect(fila.problemas).toContain("no coincide con el total de la compra");
  });

  it("si el OCR falla, la compra queda registrada como sin_datos para revisarla a mano", async () => {
    const c = await compra(5000);
    await procesarComprobanteCarrito(c, { ocr: vi.fn().mockRejectedValue(new Error("sin crédito")) });
    const [fila] = await filas();
    expect(fila).toMatchObject({ estado: "sin_datos", ordenId: c.ordenId, monto: null });
    expect(fila.problemas).toContain("OCR falló: sin crédito");
  });

  it("un fallo del OCR que no es un Error también se registra", async () => {
    const c = await compra(5000);
    await procesarComprobanteCarrito(c, { ocr: vi.fn().mockRejectedValue("raro") });
    expect((await filas())[0].problemas).toContain("OCR falló: error desconocido");
  });

  it("cruza con el aviso del banco: confirma y deja registrado qué datos coincidieron", async () => {
    const c = await compra(5000);
    await registrarAviso({
      messageId: "<aviso1@test>",
      remitente: "info@familiar.com.py",
      autenticado: true,
      sospechoso: false,
      datos: {
        banco: "Familiar",
        monto: 5000,
        pagador: "PEREZ GOMEZ JUAN CARLOS",
        fecha: "19/11/2026 22:54:47",
        referencia: null,
        operacion: "2593738",
        cuentaDestino: "81123742",
      },
    });
    await procesarComprobanteCarrito(c, ocrCon(`${OCR_ITAU}\nDE\nPEREZ GOMEZ JUAN CARLOS\nPARA\nOtro`));
    const [fila] = await filas();
    expect(fila.estado).toBe("confirmado");
    expect(fila.avisoId).not.toBeNull();
    expect(fila.coincidencias?.split(",")).toEqual(expect.arrayContaining(["monto", "comprobante", "cuenta", "fecha"]));
  });

  it("nunca lanza: si falla el guardado lo registra en el log", async () => {
    const logError = vi.spyOn(console, "error").mockImplementation(() => {});
    const c = await compra(5000);
    await procesarComprobanteCarrito({ ...c, ordenId: 999999 }, ocrCon(OCR_ITAU)); // orden inexistente: viola la FK
    expect(logError).toHaveBeenCalledWith(expect.stringContaining(c.codigoOrden), expect.anything());
    expect(await db.select().from(comprobantesWhatsapp).where(eq(comprobantesWhatsapp.ordenId, 999999))).toHaveLength(0);
  });

  it("sin contacto guarda el remitente vacío y un Error que no es Error también se loguea", async () => {
    const logError = vi.spyOn(console, "error").mockImplementation(() => {});
    const c = await compra(5000);
    await procesarComprobanteCarrito({ ...c, contacto: null }, ocrCon(OCR_ITAU));
    expect((await filas())[0].waFrom).toBe("");
    expect(logError).not.toHaveBeenCalled();
  });

  it("un monto distinto al de la compra suma el motivo aunque ya estuviera observado por otro problema", async () => {
    const primera = await compra(5000);
    await procesarComprobanteCarrito(primera, ocrCon(OCR_ITAU)); // Nº 2593738 sin confirmar
    const segunda = await compra(8000); // el mismo comprobante (Gs. 5.000) en una compra de Gs. 8.000
    await procesarComprobanteCarrito(segunda, ocrCon(OCR_ITAU));
    const fila = (await filas()).find((f) => f.ordenId === segunda.ordenId)!;
    expect(fila.estado).toBe("observado");
    expect(fila.problemas).toContain("ya lo usó el comprobante");
    expect(fila.problemas).toContain("no coincide con el total de la compra");
  });

  it("si falla el guardado con algo que no es un Error, igual lo registra en el log", async () => {
    const logError = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(comprobantes, "registrarComprobante").mockRejectedValueOnce("raro");
    const c = await compra(5000);
    await procesarComprobanteCarrito(c, ocrCon(OCR_ITAU));
    expect(logError).toHaveBeenCalledWith(expect.stringContaining(c.codigoOrden), "raro");
  });
});
