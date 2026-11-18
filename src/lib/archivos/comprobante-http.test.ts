import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { directorioUploads } from "./comprobante";
import { respuestaComprobante } from "./comprobante-http";

describe("respuestaComprobante", () => {
  let raiz: string;

  beforeEach(async () => {
    raiz = await mkdtemp(path.join(tmpdir(), "eike-comprobantes-"));
    await mkdir(path.join(raiz, "comprobantes"), { recursive: true });
    vi.stubEnv("UPLOADS_DIR", raiz);
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(raiz, { recursive: true, force: true });
  });

  it.each([
    ["ORD-ABCDEF123456.jpg", "image/jpeg"],
    ["ORD-ABCDEF123456.png", "image/png"],
    ["EIK-ABCDEF123456.webp", "image/webp"],
    ["EIK-ABCDEF123456.pdf", "application/pdf"],
  ])("sirve %s como %s, en línea y sin cachear", async (nombre, mime) => {
    await writeFile(path.join(raiz, "comprobantes", nombre), "contenido");

    const respuesta = await respuestaComprobante(nombre, "comprobante-ORD-1");

    expect(respuesta.status).toBe(200);
    expect(respuesta.headers.get("Content-Type")).toBe(mime);
    expect(respuesta.headers.get("Content-Length")).toBe("9");
    expect(respuesta.headers.get("Content-Disposition")).toBe(`inline; filename="comprobante-ORD-1.${nombre.split(".")[1]}"`);
    expect(respuesta.headers.get("Cache-Control")).toBe("private, no-store");
    expect(respuesta.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(await respuesta.text()).toBe("contenido");
  });

  it("sin nombre de archivo → 404", async () => {
    expect((await respuestaComprobante(null, "x")).status).toBe(404);
  });

  it.each(["../../etc/passwd", "ORD-ABCDEF123456.exe", "ORD-123.jpg", "otro.jpg", "ORD-ABCDEF123456.jpg/../x"])(
    "rechaza el nombre no válido %s (nunca toca el disco)",
    async (nombre) => {
      expect((await respuestaComprobante(nombre, "x")).status).toBe(404);
    },
  );

  it("un nombre válido cuyo archivo no existe → 404", async () => {
    expect((await respuestaComprobante("ORD-ABCDEF123456.jpg", "x")).status).toBe(404);
  });
});

describe("directorioUploads", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("usa UPLOADS_DIR, o ./.data/uploads si no está definida", () => {
    vi.stubEnv("UPLOADS_DIR", "/datos/subidos");
    expect(directorioUploads()).toBe("/datos/subidos");
    vi.stubEnv("UPLOADS_DIR", "");
    expect(directorioUploads()).toBe("./.data/uploads");
  });
});
