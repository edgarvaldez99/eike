import { afterEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { db } from "@/db/cliente";
import { comprobantesWhatsapp } from "@/db/esquema";
import { crearOrden, crearUsuario } from "@/test/fixtures";
import { registrarAviso } from "@/server/conciliacion/avisos";
import { procesarPayload, type DepsWhatsapp } from "./procesar";

const TEXTO_OCR = `ueno bank · Comprobante de transferencia
Nro. de comprobante: 2607093255696 · GS. 10.000
DE: PAGADOR DE PRUEBA (Caja de ahorro 1, ueno bank)
PARA: EIKE EAS (Nro. 2, BANCO ITAU PARAGUAY S.A.)
Concepto: pago tiquetero`;

async function deps(texto = TEXTO_OCR): Promise<DepsWhatsapp> {
  const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#ffffff" } }).png().toBuffer();
  return {
    descargarMedia: vi.fn(async () => ({ buffer: png, mime: "image/png" })),
    ocr: vi.fn(async () => texto),
  };
}

const mensaje = (id: string, tipo = "image") => ({
  entry: [
    {
      changes: [
        {
          value: {
            contacts: [{ profile: { name: "Comprador" } }],
            messages: [{ id, from: "595991258700", type: tipo, image: { id: `media-${id}` } }],
          },
        },
      ],
    },
  ],
});

describe("procesarPayload", () => {
  it("guarda el comprobante con los datos del OCR, lo cruza con la orden y queda pendiente del banco", async () => {
    const organizadorId = await crearUsuario({ rol: "organizador" });
    const ordenId = await crearOrden({ organizadorId, estado: "pendiente", subtotal: 10000 });

    const resumen = await procesarPayload(mensaje("wamid.A"), await deps());

    expect(resumen).toMatchObject({ procesados: 1, errores: 0 });
    const [fila] = await db.select().from(comprobantesWhatsapp);
    expect(fila).toMatchObject({ estado: "pendiente_banco", monto: 10000, nroComprobante: "2607093255696", banco: "ueno", ordenId });
    expect(fila.archivo).toMatch(/^595991258700_media.*\.png$/);
  });

  it("doble check: si el aviso del banco ya había llegado, queda confirmado al procesar el comprobante", async () => {
    await registrarAviso({
      messageId: "<op@test>",
      remitente: "info@itau.com.py",
      autenticado: true,
      sospechoso: false,
      datos: { banco: "Itaú", monto: 10000, pagador: "X", fecha: null, referencia: null, operacion: "OP-9" },
    });
    await procesarPayload(mensaje("wamid.B"), await deps());
    const [fila] = await db.select().from(comprobantesWhatsapp);
    expect(fila.estado).toBe("confirmado");
    expect(fila.avisoId).not.toBeNull();
  });

  it("el mismo mensaje reintentado por Meta no se duplica", async () => {
    const d = await deps();
    await procesarPayload(mensaje("wamid.C"), d);
    const resumen = await procesarPayload(mensaje("wamid.C"), d);
    expect(resumen.repetidos).toBe(1);
    expect(await db.select().from(comprobantesWhatsapp)).toHaveLength(1);
  });

  it("el mismo Nº de comprobante en otro mensaje queda 'duplicado'", async () => {
    const d = await deps();
    await procesarPayload(mensaje("wamid.D1"), d);
    await procesarPayload(mensaje("wamid.D2"), d);
    const filas = await db.select().from(comprobantesWhatsapp);
    expect(filas.map((f) => f.estado).sort()).toEqual(["duplicado", "pendiente_banco"]);
  });

  it("si el OCR falla o no lee monto, queda 'sin_datos' con el motivo", async () => {
    const d = await deps();
    d.ocr = vi.fn(async () => {
      throw new Error("sin crédito");
    });
    await procesarPayload(mensaje("wamid.E"), d);
    const [fila] = await db.select().from(comprobantesWhatsapp);
    expect(fila.estado).toBe("sin_datos");
    expect(fila.problemas).toContain("OCR falló");
  });

  it("ignora mensajes de texto y eventos de otro número", async () => {
    const d = await deps();
    expect((await procesarPayload(mensaje("wamid.F", "text"), d)).ignorados).toBe(1);
    expect(await db.select().from(comprobantesWhatsapp)).toHaveLength(0);
    expect(d.descargarMedia).not.toHaveBeenCalled();
  });

  it("ignora eventos que no son del número de la plataforma", async () => {
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "111");
    try {
      const d = await deps();
      const ajeno = mensaje("wamid.G");
      (ajeno.entry[0].changes[0].value as Record<string, unknown>).metadata = { phone_number_id: "999" };
      expect((await procesarPayload(ajeno, d)).ignorados).toBe(1);
      expect(d.descargarMedia).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("un payload con forma inesperada no rompe", async () => {
    expect(await procesarPayload("basura", await deps())).toMatchObject({ procesados: 0, errores: 0 });
    expect(await procesarPayload({ entry: "x" }, await deps())).toMatchObject({ procesados: 0 });
  });
});

describe("procesarPayload: casos límite", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  const ultimo = async () => (await db.select().from(comprobantesWhatsapp)).at(-1)!;

  it("beneficiario esperado: si no figura en el comprobante queda 'observado' con el motivo", async () => {
    vi.stubEnv("CONCILIACION_BENEFICIARIO", "Otra Empresa");
    await procesarPayload(mensaje("wamid.H1"), await deps());
    const fila = await ultimo();
    expect(fila.estado).toBe("observado");
    expect(fila.problemas).toContain('el beneficiario no contiene "otra empresa"');
  });

  it("beneficiario esperado: si figura en el comprobante no hay observación", async () => {
    vi.stubEnv("CONCILIACION_BENEFICIARIO", "eike eas");
    await procesarPayload(mensaje("wamid.H2"), await deps());
    expect((await ultimo()).estado).toBe("pendiente_banco");
  });

  it("beneficiario esperado pero ilegible: no pisa un estado que ya era peor (sin_datos)", async () => {
    vi.stubEnv("CONCILIACION_BENEFICIARIO", "eike");
    await procesarPayload(mensaje("wamid.H3"), await deps("texto sin datos útiles"));
    const fila = await ultimo();
    expect(fila.estado).toBe("sin_datos");
    expect(fila.problemas).toContain("el beneficiario no contiene");
  });

  it("no asigna a un comprobante una orden que ya quedó asignada a otro", async () => {
    const organizadorId = await crearUsuario({ rol: "organizador" });
    const ordenA = await crearOrden({ organizadorId, estado: "pendiente", subtotal: 10000 });
    await procesarPayload(mensaje("wamid.I1"), await deps());
    const ordenB = await crearOrden({ organizadorId, estado: "pendiente", subtotal: 10000 });

    const otroNumero = TEXTO_OCR.replace("2607093255696", "9999999999999");
    await procesarPayload(mensaje("wamid.I2"), await deps(otroNumero));

    const filas = await db.select().from(comprobantesWhatsapp).orderBy(comprobantesWhatsapp.id);
    expect(filas.map((f) => f.ordenId)).toEqual([ordenA, ordenB]);
  });

  it("acepta PDFs (documentos) con su caption, que ayuda a identificar la orden", async () => {
    const organizadorId = await crearUsuario({ rol: "organizador" });
    const [codigoA] = await Promise.all([crearOrden({ organizadorId, estado: "pendiente", subtotal: 10000, codigo: "ORD-CAPTION1" })]);
    await crearOrden({ organizadorId, estado: "pendiente", subtotal: 10000 });
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                messages: [{ id: "wamid.J", from: "595981000000", type: "document", document: { id: "doc-1", caption: "pago ORD-CAPTION1" } }],
              },
            },
          ],
        },
      ],
    };

    expect(await procesarPayload(payload, await deps())).toMatchObject({ procesados: 1 });

    const fila = await ultimo();
    expect(fila).toMatchObject({ caption: "pago ORD-CAPTION1", ordenId: codigoA, nombrePerfil: null });
  });

  it("un mensaje de imagen sin el objeto image, o de otro número sin mensajes, se ignora sin romper", async () => {
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "111");
    const sinMedia = { entry: [{ changes: [{ value: { messages: [{ id: "w1", from: "1", type: "image" }] } }] }] };
    const ajenoSinMensajes = { entry: [{ changes: [{ value: { metadata: { phone_number_id: "999" } } }] }] };
    const d = await deps();

    expect((await procesarPayload(sinMedia, d)).ignorados).toBe(1);
    expect((await procesarPayload(ajenoSinMensajes, d)).ignorados).toBe(0);
  });

  it("si la descarga falla cuenta un error y sigue con el resto, sea Error o cualquier otro valor lanzado", async () => {
    const logError = vi.spyOn(console, "error").mockImplementation(() => {});
    const d = await deps();
    d.descargarMedia = vi.fn().mockRejectedValueOnce(new Error("Meta caído")).mockRejectedValueOnce("texto suelto");

    expect(await procesarPayload(mensaje("wamid.K1"), d)).toMatchObject({ errores: 1, procesados: 0 });
    expect(await procesarPayload(mensaje("wamid.K2"), d)).toMatchObject({ errores: 1 });
    expect(logError).toHaveBeenCalledWith(expect.stringContaining("wamid.K1"), "Meta caído");
    expect(logError).toHaveBeenCalledWith(expect.stringContaining("wamid.K2"), "texto suelto");
  });

  it("si el OCR lanza un valor que no es Error, el motivo dice 'error desconocido'", async () => {
    const d = await deps();
    d.ocr = vi.fn().mockRejectedValue("fallo");
    await procesarPayload(mensaje("wamid.L"), d);
    expect((await ultimo()).problemas).toContain("OCR falló: error desconocido");
  });

  it("el nombre del contacto es opcional: sin perfil o sin nombre queda en null", async () => {
    const d = await deps();
    const conContactos = (contacts: unknown[], id: string) => {
      const m = mensaje(id);
      (m.entry[0].changes[0].value as Record<string, unknown>).contacts = contacts;
      return m;
    };
    await procesarPayload(conContactos([{}], "wamid.N1"), d);
    await procesarPayload(conContactos([{ profile: {} }], "wamid.N2"), d);
    const sinContactos = mensaje("wamid.N3");
    delete (sinContactos.entry[0].changes[0].value as Record<string, unknown>).contacts;
    await procesarPayload(sinContactos, d);
    const filas = await db.select().from(comprobantesWhatsapp);
    expect(filas.map((f) => f.nombrePerfil)).toEqual([null, null, null]);
  });

  it("los avisos de estado (sin mensajes) no hacen nada", async () => {
    const soloEstados = { entry: [{ changes: [{ value: { metadata: { phone_number_id: "1" } } }] }] };
    expect(await procesarPayload(soloEstados, await deps())).toEqual({ procesados: 0, ignorados: 0, repetidos: 0, errores: 0 });
  });

  it("sin dependencias explícitas usa las reales (acá solo se ignora un texto, sin tocar la red)", async () => {
    expect(await procesarPayload(mensaje("wamid.M", "text"))).toMatchObject({ ignorados: 1, procesados: 0 });
  });
});
