import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/cliente";
import { avisosBanco, comprobantesWhatsapp } from "@/db/esquema";
import { crearOrden, crearUsuario } from "@/test/fixtures";
import { registrarAviso } from "./avisos";
import { cruzarComprobantesConAvisos } from "./cruce";

let seq = 0;
async function comprobante(monto: number | null, extra: Partial<typeof comprobantesWhatsapp.$inferInsert> = {}) {
  seq += 1;
  const [fila] = await db
    .insert(comprobantesWhatsapp)
    .values({ waMessageId: `wamid.${seq}`, waFrom: "595991258700", estado: "pendiente_banco", monto, pagador: "ANA MARIA PEREZ", ...extra })
    .returning();
  return fila;
}
const aviso = (monto: number, operacion: string, sospechoso = false, pagador: string | null = "PEREZ GOMEZ ANA MARIA") =>
  registrarAviso({
    messageId: `<${operacion}@test>`,
    remitente: "info@itau.com.py",
    autenticado: true,
    sospechoso,
    datos: { banco: "Itaú", monto, pagador, fecha: null, referencia: null, operacion, cuentaDestino: null },
  });
const estadoDe = async (id: number) =>
  (await db.select().from(comprobantesWhatsapp).where(eq(comprobantesWhatsapp.id, id)))[0];

describe("cruzarComprobantesConAvisos (doble check)", () => {
  it("comprobante primero, aviso del banco después → confirmado, con la orden del aviso", async () => {
    const organizadorId = await crearUsuario({ rol: "organizador" });
    const ordenId = await crearOrden({ organizadorId, estado: "pendiente", subtotal: 80000 });
    const c = await comprobante(80000);
    expect(await cruzarComprobantesConAvisos()).toBe(0); // todavía no hay aviso

    await aviso(80000, "OP1");
    expect(await cruzarComprobantesConAvisos()).toBe(1);

    const fila = await estadoDe(c.id);
    expect(fila.estado).toBe("confirmado");
    expect(fila.avisoId).not.toBeNull();
    expect(fila.ordenId).toBe(ordenId);
  });

  it("aviso primero, comprobante después → también confirma", async () => {
    await aviso(55000, "OP2");
    const c = await comprobante(55000);
    expect(await cruzarComprobantesConAvisos()).toBe(1);
    expect((await estadoDe(c.id)).estado).toBe("confirmado");
  });

  it("el monto solo no alcanza: con otro pagador el comprobante queda pendiente de revisión", async () => {
    await aviso(65000, "OP-A", false, "JUAN CARLOS BENITEZ");
    const c = await comprobante(65000); // pagador del comprobante: ANA MARIA PEREZ
    expect(await cruzarComprobantesConAvisos()).toBe(0);
    expect((await estadoDe(c.id)).estado).toBe("pendiente_banco");
  });

  it("sin pagador en el aviso (ej. UENO) tampoco se confirma solo por el monto", async () => {
    await aviso(66000, "OP-B", false, null);
    const c = await comprobante(66000);
    expect(await cruzarComprobantesConAvisos()).toBe(0);
    expect((await estadoDe(c.id)).estado).toBe("pendiente_banco");
  });

  it("confirma por el Nº de comprobante aunque el pagador no coincida", async () => {
    await aviso(67000, "BCNAPYPA0806266375901", false, null);
    const c = await comprobante(67000, { nroComprobante: "BCNAPYPA0806266375901", pagador: null });
    expect(await cruzarComprobantesConAvisos()).toBe(1);
    expect((await estadoDe(c.id)).estado).toBe("confirmado");
  });

  it("con varios avisos del mismo monto confirma el que corrobora, no simplemente el primero", async () => {
    await aviso(68000, "OP-C1", false, "JUAN CARLOS BENITEZ");
    await aviso(68000, "OP-C2");
    const c = await comprobante(68000);

    expect(await cruzarComprobantesConAvisos()).toBe(1);

    const fila = await estadoDe(c.id);
    expect(fila.estado).toBe("confirmado");
    const [elegido] = await db.select().from(avisosBanco).where(eq(avisosBanco.id, fila.avisoId as number));
    expect(elegido.operacion).toBe("OP-C2");
  });

  it("monto distinto → no confirma", async () => {
    await aviso(55000, "OP3");
    const c = await comprobante(56000);
    expect(await cruzarComprobantesConAvisos()).toBe(0);
    expect((await estadoDe(c.id)).estado).toBe("pendiente_banco");
  });

  it("un aviso descartado (remitente falso) nunca confirma un comprobante", async () => {
    await aviso(70000, "OP4", true);
    const c = await comprobante(70000);
    expect(await cruzarComprobantesConAvisos()).toBe(0);
    expect((await estadoDe(c.id)).estado).toBe("pendiente_banco");
  });

  it("un aviso confirma un solo comprobante: el segundo con el mismo monto queda pendiente", async () => {
    await aviso(60000, "OP5");
    const a = await comprobante(60000);
    const b = await comprobante(60000);
    expect(await cruzarComprobantesConAvisos()).toBe(1);
    expect((await estadoDe(a.id)).estado).toBe("confirmado");
    expect((await estadoDe(b.id)).estado).toBe("pendiente_banco");
  });

  it("el aviso sin orden (ambiguo) no bloquea: el comprobante confirma y adopta su propia orden", async () => {
    const organizadorId = await crearUsuario({ rol: "organizador" });
    await crearOrden({ organizadorId, estado: "pendiente", subtotal: 90000 });
    const ordenB = await crearOrden({ organizadorId, estado: "pendiente", subtotal: 90000 });
    await aviso(90000, "OP6"); // dos órdenes del mismo monto → ambiguo, sin orden
    const c = await comprobante(90000, { ordenId: ordenB });

    expect(await cruzarComprobantesConAvisos()).toBe(1);
    expect((await estadoDe(c.id)).ordenId).toBe(ordenB);
  });

  it("comprobante y aviso apuntan a órdenes distintas → observado, no confirmado", async () => {
    const organizadorId = await crearUsuario({ rol: "organizador" });
    const ordenDelAviso = await crearOrden({ organizadorId, estado: "pendiente", subtotal: 91000 });
    const ordenDelComprobante = await crearOrden({ organizadorId, estado: "pagada", subtotal: 91000 });
    await aviso(91000, "OP7"); // única pendiente con ese monto → conciliado con ordenDelAviso
    const c = await comprobante(91000, { ordenId: ordenDelComprobante });

    expect(await cruzarComprobantesConAvisos()).toBe(0);

    const fila = await estadoDe(c.id);
    expect(fila.estado).toBe("observado");
    expect(fila.problemas).toBe("el comprobante y el aviso del banco apuntan a órdenes distintas");
    expect(ordenDelAviso).not.toBe(ordenDelComprobante);
  });

  it("si el comprobante ya traía problemas, el motivo se agrega a los anteriores", async () => {
    const organizadorId = await crearUsuario({ rol: "organizador" });
    await crearOrden({ organizadorId, estado: "pendiente", subtotal: 92000 });
    const otra = await crearOrden({ organizadorId, estado: "pagada", subtotal: 92000 });
    await aviso(92000, "OP8");
    const c = await comprobante(92000, { ordenId: otra, problemas: "OCR dudoso" });

    await cruzarComprobantesConAvisos();

    expect((await estadoDe(c.id)).problemas).toBe(
      "OCR dudoso | el comprobante y el aviso del banco apuntan a órdenes distintas",
    );
  });
});
