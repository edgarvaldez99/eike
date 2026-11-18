import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `after` solo existe dentro de un request de Next: en el test se ejecuta en el acto.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (tarea: () => Promise<void>) => tarea(),
}));
const { procesarPayload } = vi.hoisted(() => ({
  procesarPayload: vi.fn<(payload: unknown) => Promise<{ procesados: number }>>(),
}));
vi.mock("@/server/whatsapp/procesar", () => ({ procesarPayload }));

import { GET, POST } from "./route";

const firmar = (c: string) => `sha256=${createHmac("sha256", "secreto").update(c).digest("hex")}`;
const post = (cuerpo: string, firma?: string) =>
  new Request("http://localhost/api/whatsapp/webhook", {
    method: "POST",
    body: cuerpo,
    headers: firma ? { "x-hub-signature-256": firma } : {},
  });

beforeEach(() => {
  vi.stubEnv("WHATSAPP_VERIFY_TOKEN", "verificar");
  vi.stubEnv("WHATSAPP_APP_SECRET", "secreto");
  procesarPayload.mockReset();
  procesarPayload.mockResolvedValue({ procesados: 0 });
});
afterEach(() => vi.unstubAllEnvs());

describe("webhook de WhatsApp", () => {
  it("GET: devuelve el challenge si el token de verificación coincide", async () => {
    const res = await GET(new Request("http://localhost/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=verificar&hub.challenge=12345"));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("12345");
  });

  it("GET: 403 si el token no coincide", async () => {
    const res = await GET(new Request("http://localhost/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=otro&hub.challenge=1"));
    expect(res.status).toBe(403);
  });

  it("POST: 403 y no procesa nada si la firma es inválida o falta", async () => {
    expect((await POST(post("{}", "sha256=mala"))).status).toBe(403);
    expect((await POST(post("{}"))).status).toBe(403);
    expect(procesarPayload).not.toHaveBeenCalled();
  });

  it("POST: 503 si no hay App Secret configurado", async () => {
    vi.stubEnv("WHATSAPP_APP_SECRET", "");
    expect((await POST(post("{}", firmar("{}")))).status).toBe(503);
  });

  it("POST: con firma válida responde 200 y procesa el payload", async () => {
    const cuerpo = JSON.stringify({ entry: [] });
    const res = await POST(post(cuerpo, firmar(cuerpo)));
    expect(res.status).toBe(200);
    expect(procesarPayload).toHaveBeenCalledWith({ entry: [] });
  });
});
