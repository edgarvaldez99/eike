import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db/cliente";
import { mensajesWhatsapp } from "@/db/esquema";
import { enviarPlantilla, enviarTexto } from "./enviar";
import { actualizarEstadoSaliente, registrarMensaje } from "./mensajes";

const NUMERO = "595991258700";
const fetchFalso = vi.fn();

async function abrirVentana(numero = NUMERO) {
  await registrarMensaje({
    direccion: "entrante", waMessageId: `in-${numero}`, numero, ordenId: null, tipo: "texto", contenido: "hola", estado: "recibido",
  });
}

describe("envío de WhatsApp", () => {
  beforeEach(() => {
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "token-de-prueba");
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "123");
    vi.stubGlobal("fetch", fetchFalso);
    fetchFalso.mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("con el envío apagado no llama a Meta y deja el mensaje como simulado", async () => {
    vi.stubEnv("WHATSAPP_ENVIO_ACTIVO", "");
    await abrirVentana();
    expect(await enviarTexto(NUMERO, "hola")).toEqual({ estado: "simulado" });
    expect(fetchFalso).not.toHaveBeenCalled();
    const filas = await db.select().from(mensajesWhatsapp);
    expect(filas.filter((f) => f.estado === "simulado")).toHaveLength(1);
  });

  it("texto libre sin ventana abierta: no se intenta y se avisa", async () => {
    vi.stubEnv("WHATSAPP_ENVIO_ACTIVO", "true");
    expect(await enviarTexto(NUMERO, "hola")).toEqual({ estado: "sin_ventana" });
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it("con la ventana abierta envía el texto con el token y guarda el id de Meta", async () => {
    vi.stubEnv("WHATSAPP_ENVIO_ACTIVO", "true");
    await abrirVentana();
    fetchFalso.mockResolvedValueOnce(new Response(JSON.stringify({ messages: [{ id: "wamid.OUT" }] })));
    expect(await enviarTexto(NUMERO, "hola")).toEqual({ estado: "enviado", waMessageId: "wamid.OUT" });
    const [url, init] = fetchFalso.mock.calls[0];
    expect(url).toContain("/123/messages");
    expect(init.headers.Authorization).toBe("Bearer token-de-prueba");
    expect(JSON.parse(init.body)).toMatchObject({ messaging_product: "whatsapp", to: NUMERO, type: "text", text: { body: "hola" } });
  });

  it("si Meta rechaza (p. ej. 141010) no lanza: devuelve fallido y lo registra", async () => {
    vi.stubEnv("WHATSAPP_ENVIO_ACTIVO", "true");
    fetchFalso.mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 141010, message: "no verificado" } }), { status: 400 }));
    const r = await enviarPlantilla(NUMERO, { nombre: "pedido_recibido", parametros: ["Ana", "ORD-1"] });
    expect(r).toEqual({ estado: "fallido", error: "141010 no verificado" });
    const [fila] = await db.select().from(mensajesWhatsapp);
    expect(fila).toMatchObject({ estado: "fallido", tipo: "plantilla", contenido: "pedido_recibido" });
  });

  it("la plantilla arma los parámetros del cuerpo en orden", async () => {
    vi.stubEnv("WHATSAPP_ENVIO_ACTIVO", "true");
    fetchFalso.mockResolvedValueOnce(new Response(JSON.stringify({ messages: [{ id: "wamid.T" }] })));
    await enviarPlantilla(NUMERO, { nombre: "entradas_aprobadas", parametros: ["Ana", "Rock", "https://x"] });
    expect(JSON.parse(fetchFalso.mock.calls[0][1].body).template).toEqual({
      name: "entradas_aprobadas",
      language: { code: "es" },
      components: [{ type: "body", parameters: [{ type: "text", text: "Ana" }, { type: "text", text: "Rock" }, { type: "text", text: "https://x" }] }],
    });
  });

  it("los estados de entrega avanzan pero no retroceden; un fallo siempre se aplica", async () => {
    await registrarMensaje({ direccion: "saliente", waMessageId: "w1", numero: NUMERO, ordenId: null, tipo: "texto", contenido: "x", estado: "enviado" });
    await actualizarEstadoSaliente("w1", "leido");
    await actualizarEstadoSaliente("w1", "entregado");
    expect((await db.select().from(mensajesWhatsapp))[0].estado).toBe("leido");
    await actualizarEstadoSaliente("w1", "fallido", "131047 ventana");
    expect((await db.select().from(mensajesWhatsapp))[0]).toMatchObject({ estado: "fallido", error: "131047 ventana" });
  });
});
