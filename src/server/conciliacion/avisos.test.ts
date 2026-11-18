import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/cliente";
import { avisosBanco, ordenes } from "@/db/esquema";
import { crearOrden, crearUsuario } from "@/test/fixtures";
import { registrarAviso, type EntradaAviso } from "./avisos";

function aviso(sobre: Partial<EntradaAviso> & { monto?: number | null; referencia?: string | null; operacion?: string | null } = {}): EntradaAviso {
  return {
    messageId: sobre.messageId ?? `<${Math.random()}@test>`,
    remitente: sobre.remitente ?? "info@itau.com.py",
    autenticado: sobre.autenticado ?? true,
    sospechoso: sobre.sospechoso ?? false,
    datos: {
      banco: "Itaú",
      monto: sobre.monto === undefined ? 50000 : sobre.monto,
      pagador: "COMPRADOR DE PRUEBA",
      fecha: "16/11/2026 19:00:00",
      referencia: sobre.referencia ?? null,
      operacion: sobre.operacion === undefined ? `OP${Math.random()}` : sobre.operacion,
    },
  };
}

describe("registrarAviso", () => {
  it("concilia con la única orden pendiente del mismo monto, sin aprobarla", async () => {
    const organizadorId = await crearUsuario({ rol: "organizador" });
    const ordenId = await crearOrden({ organizadorId, estado: "pendiente", subtotal: 50000 });

    const resultado = await registrarAviso(aviso());

    expect(resultado).toEqual({ estado: "conciliado", ordenId });
  });

  it("monto sin orden pendiente → sin_cruzar", async () => {
    const organizadorId = await crearUsuario({ rol: "organizador" });
    await crearOrden({ organizadorId, estado: "pendiente", subtotal: 70000 });
    expect(await registrarAviso(aviso({ monto: 50000 }))).toEqual({ estado: "sin_cruzar", ordenId: null });
  });

  it("un aviso sin monto legible se guarda como sin_cruzar, sin intentar conciliar", async () => {
    const organizadorId = await crearUsuario({ rol: "organizador" });
    await crearOrden({ organizadorId, estado: "pendiente", subtotal: 50000 });
    expect(await registrarAviso(aviso({ monto: null }))).toEqual({ estado: "sin_cruzar", ordenId: null });
  });

  it("no concilia órdenes que ya no están pendientes", async () => {
    const organizadorId = await crearUsuario({ rol: "organizador" });
    await crearOrden({ organizadorId, estado: "pagada", subtotal: 50000 });
    expect(await registrarAviso(aviso())).toEqual({ estado: "sin_cruzar", ordenId: null });
  });

  it("dos órdenes con el mismo monto → ambiguo, salvo que el concepto traiga el código de una", async () => {
    const organizadorId = await crearUsuario({ rol: "organizador" });
    const a = await crearOrden({ organizadorId, estado: "pendiente", subtotal: 50000 });
    await crearOrden({ organizadorId, estado: "pendiente", subtotal: 50000 });

    expect(await registrarAviso(aviso())).toEqual({ estado: "ambiguo", ordenId: null });

    const [filaA] = await db.select({ codigo: ordenes.codigo }).from(ordenes).where(eq(ordenes.id, a));
    expect(await registrarAviso(aviso({ referencia: `pago ${filaA.codigo}` }))).toEqual({ estado: "conciliado", ordenId: a });
  });

  it("una orden ya conciliada no vuelve a ser candidata: el segundo pago igual queda sin cruzar", async () => {
    const organizadorId = await crearUsuario({ rol: "organizador" });
    const ordenId = await crearOrden({ organizadorId, estado: "pendiente", subtotal: 50000 });

    expect(await registrarAviso(aviso())).toEqual({ estado: "conciliado", ordenId });
    expect(await registrarAviso(aviso())).toEqual({ estado: "sin_cruzar", ordenId: null });
  });

  it("remitente sospechoso → descartado, aunque el monto coincida con una orden", async () => {
    const organizadorId = await crearUsuario({ rol: "organizador" });
    await crearOrden({ organizadorId, estado: "pendiente", subtotal: 50000 });
    expect(await registrarAviso(aviso({ sospechoso: true, remitente: "x@evil.com" }))).toEqual({ estado: "descartado", ordenId: null });
  });

  it("el mismo correo o la misma operación del banco no se registran dos veces", async () => {
    const base = aviso({ messageId: "<fijo@test>", operacion: "OP-FIJA" });
    expect(await registrarAviso(base)).not.toBe("duplicado");
    expect(await registrarAviso(base)).toBe("duplicado");
    expect(await registrarAviso(aviso({ operacion: "OP-FIJA" }))).toBe("duplicado");
    expect(await db.select().from(avisosBanco)).toHaveLength(1);
  });
});
