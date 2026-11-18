import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { descargarMedia } from "./api";

const json = (cuerpo: unknown, status = 200) => ({ ok: status < 400, status, json: async () => cuerpo }) as Response;
const binario = (bytes: string, status = 200) =>
  ({ ok: status < 400, status, arrayBuffer: async () => Buffer.from(bytes) }) as unknown as Response;

describe("descargarMedia", () => {
  const fetchFalso = vi.fn();

  beforeEach(() => {
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "token-de-prueba");
    vi.stubGlobal("fetch", fetchFalso);
    fetchFalso.mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("sin WHATSAPP_ACCESS_TOKEN falla antes de llamar a Meta", async () => {
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "");
    await expect(descargarMedia("m1")).rejects.toThrow("WHATSAPP_ACCESS_TOKEN");
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it("pide la URL del media y baja el binario, ambos con el token (versión de Graph por defecto)", async () => {
    fetchFalso
      .mockResolvedValueOnce(json({ url: "https://cdn.test/archivo", mime_type: "image/jpeg" }))
      .mockResolvedValueOnce(binario("contenido"));

    const media = await descargarMedia("media/1");

    expect(media.buffer.toString()).toBe("contenido");
    expect(media.mime).toBe("image/jpeg");
    expect(fetchFalso.mock.calls[0][0]).toBe("https://graph.facebook.com/v23.0/media%2F1");
    expect(fetchFalso.mock.calls[0][1].headers).toEqual({ Authorization: "Bearer token-de-prueba" });
    expect(fetchFalso.mock.calls[1][0]).toBe("https://cdn.test/archivo");
    expect(fetchFalso.mock.calls[1][1].headers).toEqual({ Authorization: "Bearer token-de-prueba" });
  });

  it("respeta WHATSAPP_GRAPH_VERSION y usa un mime genérico si Meta no lo informa", async () => {
    vi.stubEnv("WHATSAPP_GRAPH_VERSION", "v99.0");
    fetchFalso.mockResolvedValueOnce(json({ url: "https://cdn.test/a" })).mockResolvedValueOnce(binario("x"));

    const media = await descargarMedia("m");

    expect(fetchFalso.mock.calls[0][0]).toContain("/v99.0/");
    expect(media.mime).toBe("application/octet-stream");
  });

  it("si Meta no devuelve la URL, el error trae el mensaje de Meta", async () => {
    fetchFalso.mockResolvedValueOnce(json({ error: { message: "token vencido" } }, 400));
    await expect(descargarMedia("m")).rejects.toThrow("token vencido");
  });

  it("si Meta no devuelve la URL ni un mensaje, el error trae el estado HTTP", async () => {
    fetchFalso.mockResolvedValueOnce(json({}, 500));
    await expect(descargarMedia("m")).rejects.toThrow("500");
  });

  it("si la descarga del binario falla, lo informa", async () => {
    fetchFalso.mockResolvedValueOnce(json({ url: "https://cdn.test/a" })).mockResolvedValueOnce(binario("", 404));
    await expect(descargarMedia("m")).rejects.toThrow("No se pudo descargar el media (404)");
  });
});
