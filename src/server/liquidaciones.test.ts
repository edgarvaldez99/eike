import { describe, expect, it } from "vitest";
import { crearLiquidacion, resumenOrganizador, resumenTodosLosOrganizadores } from "@/server/liquidaciones";
import { crearEvento, crearTanda, crearTicket, crearUsuario } from "@/test/fixtures";
import { ErrorNegocio } from "@/lib/errores";

describe("resumenOrganizador", () => {
  it("sin ventas ni liquidaciones, todo en cero", async () => {
    const organizadorId = await crearUsuario({ rol: "organizador" });
    const resumen = await resumenOrganizador(organizadorId);
    expect(resumen).toEqual({ ingresosConfirmados: 0, retirado: 0, pendiente: 0 });
  });

  it("solo cuenta tickets 'disponible' o 'usado' como ingresos confirmados (no pendiente/anulado)", async () => {
    const organizadorId = await crearUsuario({ rol: "organizador" });
    const eventoId = await crearEvento({ organizadorId });
    const tandaId = await crearTanda({ eventoId, precio: 100000 });

    await crearTicket({ eventoId, tandaId, estado: "disponible" });
    await crearTicket({ eventoId, tandaId, estado: "usado" });
    await crearTicket({ eventoId, tandaId, estado: "pendiente" });
    await crearTicket({ eventoId, tandaId, estado: "anulado" });

    const resumen = await resumenOrganizador(organizadorId);

    expect(resumen.ingresosConfirmados).toBe(200000);
    expect(resumen.pendiente).toBe(200000);
  });

  it("después de una liquidación, lo retirado sube y lo pendiente baja por el neto", async () => {
    const organizadorId = await crearUsuario({ rol: "organizador" });
    const eventoId = await crearEvento({ organizadorId });
    const tandaId = await crearTanda({ eventoId, precio: 100000 });
    await crearTicket({ eventoId, tandaId, estado: "usado" });
    await crearTicket({ eventoId, tandaId, estado: "usado" });

    await crearLiquidacion({
      organizadorId,
      periodoInicio: "2026-01-01",
      periodoFin: "2026-01-31",
      totalVendido: 150000,
      montoComisionOSuscripcion: 10000,
    });

    const resumen = await resumenOrganizador(organizadorId);

    expect(resumen.ingresosConfirmados).toBe(200000);
    expect(resumen.retirado).toBe(140000); // neto: 150000 - 10000
    expect(resumen.pendiente).toBe(50000); // 200000 - 150000 (bruto liquidado)
  });

  it("pendiente nunca es negativo aunque se liquide más de lo vendido", async () => {
    const organizadorId = await crearUsuario({ rol: "organizador" });
    const eventoId = await crearEvento({ organizadorId });
    const tandaId = await crearTanda({ eventoId, precio: 50000 });
    await crearTicket({ eventoId, tandaId, estado: "usado" });

    await crearLiquidacion({
      organizadorId,
      periodoInicio: "2026-01-01",
      periodoFin: "2026-01-31",
      totalVendido: 999999,
      montoComisionOSuscripcion: 0,
    });

    const resumen = await resumenOrganizador(organizadorId);
    expect(resumen.pendiente).toBe(0);
  });

  it("organizadorId null agrega TODOS los organizadores (vista superadmin)", async () => {
    const org1 = await crearUsuario({ rol: "organizador" });
    const org2 = await crearUsuario({ rol: "organizador" });
    const ev1 = await crearEvento({ organizadorId: org1 });
    const ev2 = await crearEvento({ organizadorId: org2 });
    const t1 = await crearTanda({ eventoId: ev1, precio: 100000 });
    const t2 = await crearTanda({ eventoId: ev2, precio: 300000 });
    await crearTicket({ eventoId: ev1, tandaId: t1, estado: "usado" });
    await crearTicket({ eventoId: ev2, tandaId: t2, estado: "usado" });

    const global = await resumenOrganizador(null);
    expect(global.ingresosConfirmados).toBe(400000);
  });

  it("crearLiquidacion rechaza un organizadorId que no existe (o no es organizador)", async () => {
    const compradorId = await crearUsuario({ rol: "comprador" });

    await expect(
      crearLiquidacion({
        organizadorId: compradorId,
        periodoInicio: "2026-01-01",
        periodoFin: "2026-01-31",
        totalVendido: 1000,
        montoComisionOSuscripcion: 0,
      }),
    ).rejects.toThrow(ErrorNegocio);
  });
});

describe("resumenTodosLosOrganizadores", () => {
  it("devuelve un resumen por cada organizador, ordenado por nombre", async () => {
    await crearUsuario({ rol: "organizador", nombre: "Zeta Eventos" });
    await crearUsuario({ rol: "organizador", nombre: "Alfa Producciones" });

    const resumenes = await resumenTodosLosOrganizadores();

    expect(resumenes).toHaveLength(2);
    expect(resumenes[0].nombre).toBe("Alfa Producciones");
    expect(resumenes[1].nombre).toBe("Zeta Eventos");
  });
});
