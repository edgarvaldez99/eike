import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { escribirComprobante, prepararComprobante } from "./comprobante";

const imagen = (formato: "jpeg" | "png" | "webp" | "gif") =>
  sharp({ create: { width: 4, height: 4, channels: 3, background: "#fff" } })
    .toFormat(formato)
    .toBuffer();

const archivo = (contenido: Uint8Array | string) => new File([contenido as BlobPart], "comprobante");

describe("prepararComprobante", () => {
  it.each(["jpeg", "png", "webp"] as const)("acepta una imagen %s tal cual la subió el comprador", async (formato) => {
    const buffer = await imagen(formato);
    const preparado = await prepararComprobante(archivo(buffer));
    expect(preparado.extension).toBe(formato === "jpeg" ? "jpg" : formato);
    expect(preparado.buffer.equals(buffer)).toBe(true);
  });

  it("acepta un PDF (por su firma, no por el nombre)", async () => {
    expect((await prepararComprobante(archivo("%PDF-1.7 contenido"))).extension).toBe("pdf");
  });

  it("rechaza un archivo vacío", async () => {
    await expect(prepararComprobante(archivo(""))).rejects.toThrow("Hace falta subir el comprobante");
  });

  it("rechaza un archivo de más de 8 MB", async () => {
    await expect(prepararComprobante(archivo(new Uint8Array(8 * 1024 * 1024 + 1)))).rejects.toThrow("8MB");
  });

  it("rechaza lo que no es imagen ni PDF, y las imágenes de formatos no admitidos (ej. GIF)", async () => {
    await expect(prepararComprobante(archivo("texto cualquiera"))).rejects.toThrow("JPG/PNG/WEBP");
    await expect(prepararComprobante(archivo(await imagen("gif")))).rejects.toThrow("JPG/PNG/WEBP");
  });
});

describe("escribirComprobante", () => {
  let raiz: string;
  beforeEach(async () => {
    raiz = await mkdtemp(path.join(tmpdir(), "eike-escribir-"));
    vi.stubEnv("UPLOADS_DIR", raiz);
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(raiz, { recursive: true, force: true });
  });

  it("guarda el archivo como <código>.<extensión> en la carpeta de comprobantes (la crea si falta)", async () => {
    const nombre = await escribirComprobante({ buffer: Buffer.from("datos"), extension: "png" }, "ORD-ABCDEF123456");

    expect(nombre).toBe("ORD-ABCDEF123456.png");
    expect((await readFile(path.join(raiz, "comprobantes", nombre))).toString()).toBe("datos");
  });
});
