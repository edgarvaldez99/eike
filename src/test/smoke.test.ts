import { describe, expect, it } from "vitest";
import { crearEvento, crearUsuario } from "@/test/fixtures";
import { db } from "@/db/cliente";
import { usuarios } from "@/db/esquema";

describe("smoke del entorno de test", () => {
  it("inserta y lee contra eike_test de verdad", async () => {
    const id = await crearUsuario({ rol: "organizador" });
    const [fila] = await db.select().from(usuarios).limit(1);
    expect(typeof id).toBe("number");
    expect(fila.id).toBe(id);
  });

  it("arranca limpio: el truncado de beforeEach funcionó", async () => {
    const [{ cantidad }] = await db.execute<{ cantidad: number }>("select count(*)::int as cantidad from usuarios").then((r) => r.rows);
    expect(cantidad).toBe(0);
  });

  it("crearEvento funciona con FK real a usuarios", async () => {
    const organizadorId = await crearUsuario({ rol: "organizador" });
    const eventoId = await crearEvento({ organizadorId });
    expect(eventoId).toBeGreaterThan(0);
  });
});
