import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_BYTES } from "@/lib/archivos/comprobante";
import { descargarMedia } from "./api";

const json = (cuerpo: unknown, status = 200) => new Response(JSON.stringify(cuerpo), { status });
const binario = (contenido: string | Uint8Array, init: ResponseInit = {}) =>
  new Response(contenido as BodyInit, init);

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
      .mockResolvedValueOnce(json({ url: "https://cdn.test/archivo", mime_type: "image/jpeg", file_size: 9 }))
      .mockResolvedValueOnce(binario("contenido"));

    const media = await descargarMedia("media/1");

    expect(media.buffer.toString()).toBe("contenido");
    expect(media.mime).toBe("image/jpeg");
    expect(fetchFalso.mock.calls[0][0]).toBe("https://graph.facebook.com/v23.0/media%2F1");
    expect(fetchFalso.mock.calls[0][1].headers).toEqual({ Authorization: "Bearer token-de-prueba" });
    expect(fetchFalso.mock.calls[1][0]).toBe("https://cdn.test/archivo");
    expect(fetchFalso.mock.calls[1][1].headers).toEqual({ Authorization: "Bearer token-de-prueba" });
  });

  it("une un cuerpo que llega en varias partes", async () => {
    const partes = new ReadableStream<Uint8Array>({
      start(controlador) {
        controlador.enqueue(new TextEncoder().encode("uno-"));
        controlador.enqueue(new TextEncoder().encode("dos"));
        controlador.close();
      },
    });
    fetchFalso.mockResolvedValueOnce(json({ url: "https://cdn.test/a" })).mockResolvedValueOnce(new Response(partes));

    expect((await descargarMedia("m")).buffer.toString()).toBe("uno-dos");
  });

  it("un cuerpo ausente da un archivo vacío (que el validador del comprobante rechaza después)", async () => {
    fetchFalso.mockResolvedValueOnce(json({ url: "https://cdn.test/a" })).mockResolvedValueOnce(new Response(null));
    expect((await descargarMedia("m")).buffer).toHaveLength(0);
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
    fetchFalso.mockResolvedValueOnce(json({ url: "https://cdn.test/a" })).mockResolvedValueOnce(binario("", { status: 404 }));
    await expect(descargarMedia("m")).rejects.toThrow("No se pudo descargar el media (404)");
  });

  describe("tope de tamaño", () => {
    it("rechaza ANTES de descargar si Meta informa un file_size mayor al máximo", async () => {
      fetchFalso.mockResolvedValueOnce(json({ url: "https://cdn.test/a", file_size: MAX_BYTES + 1 }));
      await expect(descargarMedia("m")).rejects.toThrow("supera el máximo");
      expect(fetchFalso).toHaveBeenCalledTimes(1); // nunca pidió el binario
    });

    it("rechaza si el Content-Length del binario supera el máximo, sin leer el cuerpo", async () => {
      fetchFalso
        .mockResolvedValueOnce(json({ url: "https://cdn.test/a" }))
        .mockResolvedValueOnce(binario("x", { headers: { "content-length": String(MAX_BYTES + 1) } }));
      await expect(descargarMedia("m")).rejects.toThrow("supera el máximo");
    });

    it("si no informan el tamaño, corta la descarga apenas se pasa del máximo", async () => {
      const bloque = new Uint8Array(1024 * 1024);
      let enviados = 0;
      const infinito = new ReadableStream<Uint8Array>({
        pull(controlador) {
          enviados += 1;
          controlador.enqueue(bloque);
        },
      });
      fetchFalso.mockResolvedValueOnce(json({ url: "https://cdn.test/a" })).mockResolvedValueOnce(new Response(infinito));

      await expect(descargarMedia("m")).rejects.toThrow("supera el máximo");

      expect(enviados).toBeLessThan(MAX_BYTES / bloque.byteLength + 4); // no se bajó "todo": se cortó al pasarse
    });

    it("un archivo justo en el máximo se acepta", async () => {
      fetchFalso
        .mockResolvedValueOnce(json({ url: "https://cdn.test/a", file_size: MAX_BYTES }))
        .mockResolvedValueOnce(binario(new Uint8Array(MAX_BYTES)));
      expect((await descargarMedia("m")).buffer).toHaveLength(MAX_BYTES);
    });
  });
});
