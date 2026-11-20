import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/cliente";
import { mensajesWhatsapp, usuarios } from "@/db/esquema";
import { crearOrden, crearUsuario } from "@/test/fixtures";
import { extraerCodigoOrden, manejarTexto } from "./consulta";
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
