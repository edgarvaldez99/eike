import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/cliente";
import { comprobantesWhatsapp, derivacionesWhatsapp } from "@/db/esquema";
import { crearOrden, crearUsuario } from "@/test/fixtures";
import {
  asignarComprobanteAOrden,
  derivarAPersona,
  listarComprobantesSinOrden,
  listarDerivacionesAbiertas,
  resolverDerivacion,
  responderDerivacion,
} from "./atencion";
import { registrarMensaje } from "./mensajes";

const NUMERO = "595991258700";
const fetchFalso = vi.fn();

async function comprobante(waMessageId: string, ordenId: number | null = null) {
  const [fila] = await db
    .insert(comprobantesWhatsapp)
    .values({ waMessageId, waFrom: NUMERO, estado: "observado", origen: "whatsapp", monto: 150000, ordenId })
    .returning({ id: comprobantesWhatsapp.id });
  return fila.id;
}

describe("derivaciones", () => {
  it("abre una sola derivación por número mientras haya una abierta", async () => {
    expect(await derivarAPersona({ numero: NUMERO, motivo: "pidió una persona", ultimoMensaje: "hola", ordenId: null })).toBe(true);
    expect(await derivarAPersona({ numero: NUMERO, motivo: "otra vez", ultimoMensaje: "hola", ordenId: null })).toBe(false);
    expect(await listarDerivacionesAbiertas()).toHaveLength(1);
  });

  it("al resolverla se puede abrir una nueva y no se resuelve dos veces", async () => {
    await derivarAPersona({ numero: NUMERO, motivo: "m", ultimoMensaje: null, ordenId: null });
    const [{ id }] = await listarDerivacionesAbiertas();
    await resolverDerivacion(id);
    await expect(resolverDerivacion(id)).rejects.toThrow("ya no está abierta");
    expect(await derivarAPersona({ numero: NUMERO, motivo: "m2", ultimoMensaje: null, ordenId: null })).toBe(true);
    const filas = await db.select().from(derivacionesWhatsapp).where(eq(derivacionesWhatsapp.numero, NUMERO));
    expect(filas.map((f) => f.estado).sort()).toEqual(["abierta", "resuelta"]);
  });
});

describe("responderDerivacion", () => {
  beforeEach(() => {
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "t");
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "123");
    vi.stubEnv("WHATSAPP_ENVIO_ACTIVO", "true");
    vi.stubGlobal("fetch", fetchFalso);
    fetchFalso.mockReset();
    fetchFalso.mockImplementation(async () => new Response(JSON.stringify({ messages: [{ id: "wamid.OUT" }] })));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("fuera de las 24 h avisa en vez de intentar enviar", async () => {
    await derivarAPersona({ numero: NUMERO, motivo: "m", ultimoMensaje: null, ordenId: null });
    const [{ id }] = await listarDerivacionesAbiertas();
    await expect(responderDerivacion(id, "hola")).rejects.toThrow("24 h");
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it("con la ventana abierta envía el texto", async () => {
    await registrarMensaje({ direccion: "entrante", waMessageId: "in-1", numero: NUMERO, ordenId: null, tipo: "texto", contenido: "hola", estado: "recibido" });
    await derivarAPersona({ numero: NUMERO, motivo: "m", ultimoMensaje: null, ordenId: null });
    const [{ id }] = await listarDerivacionesAbiertas();
    await responderDerivacion(id, "Ya lo vemos");
    expect(JSON.parse(fetchFalso.mock.calls[0][1].body)).toMatchObject({ to: NUMERO, text: { body: "Ya lo vemos" } });
  });
});

describe("comprobantes sin orden", () => {
  it("lista solo los de WhatsApp sin orden y permite asignarlos a una compra pendiente", async () => {
    const organizadorId = await crearUsuario({ rol: "organizador" });
    const ordenId = await crearOrden({ organizadorId, codigo: "ORD-AAAA11112222" });
    const id = await comprobante("wamid.A");
    await comprobante("wamid.B", ordenId);
    expect((await listarComprobantesSinOrden()).map((c) => c.id)).toEqual([id]);

    await asignarComprobanteAOrden(id, "ord-aaaa11112222");
    expect(await listarComprobantesSinOrden()).toHaveLength(0);
    const [fila] = await db.select().from(comprobantesWhatsapp).where(eq(comprobantesWhatsapp.id, id));
    expect(fila).toMatchObject({ ordenId, estado: "observado" });
  });

  it("rechaza códigos inexistentes, compras ya resueltas y comprobantes ya asignados", async () => {
    const organizadorId = await crearUsuario({ rol: "organizador" });
    await crearOrden({ organizadorId, codigo: "ORD-PAGADA000001", estado: "pagada" });
    const ordenId = await crearOrden({ organizadorId, codigo: "ORD-AAAA11112222" });
    const id = await comprobante("wamid.A");
    await expect(asignarComprobanteAOrden(id, "ORD-NOEXISTE0001")).rejects.toThrow("No existe");
    await expect(asignarComprobanteAOrden(id, "ORD-PAGADA000001")).rejects.toThrow("pendiente");
    const asignado = await comprobante("wamid.C", ordenId);
    await expect(asignarComprobanteAOrden(asignado, "ORD-AAAA11112222")).rejects.toThrow("ya está asignado");
  });
});
