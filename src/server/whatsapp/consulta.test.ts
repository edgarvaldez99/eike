import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/cliente";
import { mensajesWhatsapp, usuarios } from "@/db/esquema";
import { crearOrden, crearUsuario } from "@/test/fixtures";
import { derivacionesWhatsapp } from "@/db/esquema";
import { extraerCodigoOrden, manejarTexto, pidePersona } from "./consulta";
import { ventanaAbierta } from "./mensajes";

const NUMERO = "595991258700";

describe("extraerCodigoOrden", () => {
  it("encuentra el código en cualquier parte del texto, sin importar mayúsculas", () => {
    expect(extraerCodigoOrden("hola, mi compra es ord-a1b2c3d4e5f6 gracias")).toBe("ORD-A1B2C3D4E5F6");
    expect(extraerCodigoOrden("ORD-ABCDEF12")).toBe("ORD-ABCDEF12");
  });
  it("devuelve null sin código o con códigos de ticket suelto", () => {
    expect(extraerCodigoOrden("hola")).toBeNull();
    expect(extraerCodigoOrden("EIK-ABC123456")).toBeNull();
    expect(extraerCodigoOrden("ORD-12")).toBeNull();
  });
});

describe("manejarTexto", () => {
  beforeEach(() => {
    vi.stubEnv("WHATSAPP_ENVIO_ACTIVO", "false");
  });
  afterEach(() => vi.unstubAllEnvs());

  const salientes = () => db.select().from(mensajesWhatsapp).where(eq(mensajesWhatsapp.direccion, "saliente"));

  it("con el código de SU compra pendiente: abre la ventana, atribuye la orden y responde con el monto y el alias", async () => {
    const organizadorId = await crearUsuario({ rol: "organizador" });
    const superId = await crearUsuario({ rol: "superadmin" });
    await db.update(usuarios).set({ aliasBancarioTipo: "ruc", aliasBancarioValor: "80012345-6" }).where(eq(usuarios.id, superId));
    const ordenId = await crearOrden({ organizadorId, codigo: "ORD-AAAA11112222", contacto: NUMERO, subtotal: 150000 });

    const ok = await manejarTexto({ waMessageId: "wamid.1", numero: NUMERO, texto: "Hola, mi compra ORD-AAAA11112222" });

    expect(ok).toBe(true);
    expect(await ventanaAbierta(NUMERO)).toBe(true);
    const [entrante] = await db.select().from(mensajesWhatsapp).where(eq(mensajesWhatsapp.direccion, "entrante"));
    expect(entrante).toMatchObject({ ordenId, estado: "recibido" });
    const [saliente] = await salientes();
    expect(saliente).toMatchObject({ estado: "simulado", ordenId, tipo: "texto" });
    expect(saliente.contenido).toContain("150.000");
    expect(saliente.contenido).toContain("80012345-6");
  });

  it("orden pagada: responde con el enlace a las entradas", async () => {
    const organizadorId = await crearUsuario({ rol: "organizador" });
    await crearOrden({ organizadorId, codigo: "ORD-BBBB11112222", contacto: NUMERO, estado: "pagada" });
    await manejarTexto({ waMessageId: "wamid.2", numero: NUMERO, texto: "ORD-BBBB11112222" });
    const [saliente] = await salientes();
    expect(saliente.contenido).toContain("confirmado");
    expect(saliente.contenido).toContain("/entradas/orden/ORD-BBBB11112222");
  });

  it("desde otro número no revela nada de la compra (misma respuesta que si no existiera) ni la atribuye", async () => {
    const organizadorId = await crearUsuario({ rol: "organizador" });
    await crearOrden({ organizadorId, codigo: "ORD-CCCC11112222", contacto: NUMERO, subtotal: 99000 });
    await manejarTexto({ waMessageId: "wamid.3", numero: "595981000111", texto: "ORD-CCCC11112222" });
    await manejarTexto({ waMessageId: "wamid.4", numero: "595981000222", texto: "ORD-NOEXISTE9999" });
    const respuestas = (await salientes()).map((s) => s.contenido);
    expect(respuestas[0]).toBe(respuestas[1]);
    expect(respuestas[0]).not.toContain("99.000");
    const entrantes = await db.select().from(mensajesWhatsapp).where(eq(mensajesWhatsapp.direccion, "entrante"));
    expect(entrantes.every((e) => e.ordenId === null)).toBe(true);
  });

  it("un reintento del webhook (mismo wa_message_id) no responde dos veces", async () => {
    await manejarTexto({ waMessageId: "wamid.5", numero: NUMERO, texto: "hola" });
    const repetido = await manejarTexto({ waMessageId: "wamid.5", numero: NUMERO, texto: "hola" });
    expect(repetido).toBe(false);
    expect(await salientes()).toHaveLength(1);
  });

  it("sin código responde una guía; y corta de responder pasadas 5 respuestas en la hora", async () => {
    for (let i = 0; i < 7; i++) await manejarTexto({ waMessageId: `wamid.s${i}`, numero: NUMERO, texto: "hola" });
    const respuestas = await salientes();
    expect(respuestas).toHaveLength(5);
    expect(respuestas[0].contenido).toContain("ORD-");
  });
});

describe("derivación a una persona", () => {
  beforeEach(() => {
    vi.stubEnv("WHATSAPP_ENVIO_ACTIVO", "false");
    vi.stubEnv("CHATBOT_ACTIVO", "");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("reconoce cuando el cliente pide hablar con alguien", () => {
    expect(pidePersona("quiero hablar con una persona")).toBe(true);
    expect(pidePersona("necesito un asesor")).toBe(true);
    expect(pidePersona("pasame con alguien por favor")).toBe(true);
    expect(pidePersona("¿a qué hora abren?")).toBe(false);
  });

  it("si pide una persona abre la derivación y avisa al cliente", async () => {
    await manejarTexto({ waMessageId: "wamid.P", numero: NUMERO, texto: "quiero hablar con una persona" });
    const filas = await db.select().from(derivacionesWhatsapp);
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ numero: NUMERO, estado: "abierta", ultimoMensaje: "quiero hablar con una persona" });
    const enviados = await db.select().from(mensajesWhatsapp).where(eq(mensajesWhatsapp.direccion, "saliente"));
    expect(enviados[0].contenido).toContain("avisamos a una persona");
  });

  it("con el chatbot activo responde la IA; si la IA deriva, abre la derivación", async () => {
    vi.stubEnv("CHATBOT_ACTIVO", "true");
    vi.stubEnv("GEMINI_API_KEY", "k");
    const fetchFalso = vi.fn();
    vi.stubGlobal("fetch", fetchFalso);
    const salida = (o: object) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(o) }] } }] }));

    fetchFalso.mockResolvedValueOnce(salida({ respuesta: "Abrimos a las 20.", derivar: false, motivo: "" }));
    await manejarTexto({ waMessageId: "wamid.I1", numero: NUMERO, texto: "¿a qué hora abren?" });
    expect(await db.select().from(derivacionesWhatsapp)).toHaveLength(0);
    const e1 = await db.select().from(mensajesWhatsapp).where(eq(mensajesWhatsapp.direccion, "saliente"));
    expect(e1[0].contenido).toBe("Abrimos a las 20.");

    fetchFalso.mockResolvedValueOnce(salida({ respuesta: "x", derivar: true, motivo: "reclamo de pago" }));
    await manejarTexto({ waMessageId: "wamid.I2", numero: NUMERO, texto: "me cobraron dos veces" });
    const d = await db.select().from(derivacionesWhatsapp);
    expect(d).toHaveLength(1);
    expect(d[0].motivo).toBe("reclamo de pago");
  });

  it("si la IA no está disponible usa la guía fija", async () => {
    await manejarTexto({ waMessageId: "wamid.G", numero: NUMERO, texto: "hola" });
    const e = await db.select().from(mensajesWhatsapp).where(eq(mensajesWhatsapp.direccion, "saliente"));
    expect(e[0].contenido).toContain("asistente automático");
  });
});
