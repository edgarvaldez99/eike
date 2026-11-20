import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db/cliente";
import { mensajesWhatsapp } from "@/db/esquema";
import { avisarResultadoPorWhatsapp, textoAviso } from "./avisos";
import { crearOrden, crearUsuario } from "@/test/fixtures";
import { registrarMensaje } from "./mensajes";

const NUMERO = "595991258700";
const fetchFalso = vi.fn();

const base = {
  ordenId: 0,
  codigo: "ORD-ABCDEF123456",
  nombreComprador: "Ana",
  contacto: "0991 258700",
  eventoNombre: "Festival",
  numeroWhatsapp: "+595981000000",
};

async function abrirVentana() {
  await registrarMensaje({
    direccion: "entrante", waMessageId: "in-1", numero: NUMERO, ordenId: null, tipo: "texto", contenido: "hola", estado: "recibido",
  });
}

describe("avisos de resultado por WhatsApp", () => {
  beforeEach(async () => {
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "token-de-prueba");
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "123");
    vi.stubEnv("WHATSAPP_ENVIO_ACTIVO", "true");
    vi.stubGlobal("fetch", fetchFalso);
    fetchFalso.mockReset();
    fetchFalso.mockImplementation(async () => new Response(JSON.stringify({ messages: [{ id: "wamid.OUT" }] })));
    const organizadorId = await crearUsuario({ rol: "organizador" });
    base.ordenId = await crearOrden({ organizadorId, codigo: base.codigo });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("sin número de contacto válido no manda nada", async () => {
    expect(await avisarResultadoPorWhatsapp({ ...base, contacto: "no es un número", resultado: "aprobada" })).toBe("sin_numero");
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it("con la ventana abierta manda texto libre con el link de las entradas", async () => {
    await abrirVentana();
    const r = await avisarResultadoPorWhatsapp({ ...base, resultado: "aprobada" });
    expect(r).toEqual({ estado: "enviado", waMessageId: "wamid.OUT" });
    const cuerpo = JSON.parse(fetchFalso.mock.calls[0][1].body);
    expect(cuerpo).toMatchObject({ to: NUMERO, type: "text" });
    expect(cuerpo.text.body).toContain(base.codigo);
  });

  it("fuera de la ventana, una compra aprobada sale con la plantilla entradas_aprobadas", async () => {
    const r = await avisarResultadoPorWhatsapp({ ...base, resultado: "aprobada" });
    expect(r).toMatchObject({ estado: "enviado" });
    const cuerpo = JSON.parse(fetchFalso.mock.calls[0][1].body);
    expect(cuerpo).toMatchObject({ type: "template", template: { name: "entradas_aprobadas" } });
    expect(cuerpo.template.components[0].parameters.map((p: { text: string }) => p.text)).toEqual(
      expect.arrayContaining(["Ana", "Festival"]),
    );
    const filas = await db.select().from(mensajesWhatsapp);
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ tipo: "plantilla", ordenId: base.ordenId });
  });

  it("fuera de la ventana, un rechazo no se manda (no hay plantilla): queda el correo", async () => {
    const r = await avisarResultadoPorWhatsapp({ ...base, resultado: "rechazada" });
    expect(r).toEqual({ estado: "sin_ventana" });
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it("si Meta falla no lanza", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    fetchFalso.mockResolvedValue(new Response(JSON.stringify({ error: { code: 141010, message: "no verificado" } }), { status: 400 }));
    const r = await avisarResultadoPorWhatsapp({ ...base, resultado: "aprobada" });
    expect(r).toMatchObject({ estado: "fallido" });
  });

  it("el texto de rechazo remite al chat si hay número de plataforma y al correo si no", () => {
    expect(textoAviso({ ...base, resultado: "rechazada" })).toContain("por este chat");
    expect(textoAviso({ ...base, numeroWhatsapp: null, resultado: "rechazada" })).toContain("correo");
  });
});
