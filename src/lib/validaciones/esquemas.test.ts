import { describe, expect, it } from "vitest";
import { esquemaCrearEvento, esquemaEditarEvento } from "@/lib/validaciones/eventos";
import { esquemaCrearLiquidacion } from "@/lib/validaciones/liquidaciones";
import { esquemaAceptarInvitacion } from "@/lib/validaciones/staff";
import { esquemaCrearTanda } from "@/lib/validaciones/tandas";
import { esquemaComprar, esquemaCrearCortesia } from "@/lib/validaciones/tickets";
import { esquemaEditarOrganizador, esquemaRechazarOrganizador, esquemaRegistroComprador } from "@/lib/validaciones/usuarios";

describe("esquemaComprar", () => {
  const base = {
    evento_id: "1",
    tanda_id: "2",
    nombre_comprador: "Marta Ovelar",
    email: "marta@test.com",
    tyc_aceptado: "on",
  };

  it("acepta una compra de invitado sin asiento (tanda general)", () => {
    const resultado = esquemaComprar.safeParse({ ...base, asiento_id: null, cedula: null, contacto: null });
    expect(resultado.success).toBe(true);
    if (resultado.success) {
      expect(resultado.data.asiento_id).toBeUndefined();
    }
  });

  it("rechaza un email inválido", () => {
    const resultado = esquemaComprar.safeParse({ ...base, email: "no-es-un-email" });
    expect(resultado.success).toBe(false);
  });

  it("exige tyc_aceptado explícitamente 'on' (no lo da por sentado)", () => {
    const resultado = esquemaComprar.parse({ ...base, tyc_aceptado: undefined });
    expect(resultado.tyc_aceptado).toBe(false);
  });

  it("acepta un asiento_id real cuando la tanda es numerada", () => {
    const resultado = esquemaComprar.parse({ ...base, asiento_id: "7" });
    expect(resultado.asiento_id).toBe(7);
  });
});

describe("esquemaCrearCortesia", () => {
  it("exige nombre y email válidos", () => {
    expect(
      esquemaCrearCortesia.safeParse({ tanda_id: "1", nombre_comprador: "", email: "x@x.com" }).success,
    ).toBe(false);
    expect(
      esquemaCrearCortesia.safeParse({ tanda_id: "1", nombre_comprador: "Ana", email: "x@x.com" }).success,
    ).toBe(true);
  });
});

describe("esquemaCrearTanda", () => {
  it("rechaza precio negativo", () => {
    const resultado = esquemaCrearTanda.safeParse({
      evento_id: "1",
      nombre: "General",
      tipo: "general",
      precio: "-100",
    });
    expect(resultado.success).toBe(false);
  });

  it("acepta una tanda general con precio 0 (gratis)", () => {
    const resultado = esquemaCrearTanda.safeParse({
      evento_id: "1",
      nombre: "General",
      tipo: "general",
      precio: "0",
      cantidad_total: "100",
    });
    expect(resultado.success).toBe(true);
  });

  it("rechaza un tipo de tanda fuera del enum", () => {
    const resultado = esquemaCrearTanda.safeParse({
      evento_id: "1",
      nombre: "General",
      tipo: "vip-super-especial",
      precio: "0",
    });
    expect(resultado.success).toBe(false);
  });
});

describe("esquemaCrearEvento / esquemaEditarEvento", () => {
  it("exige nombre y fecha", () => {
    expect(esquemaCrearEvento.safeParse({ nombre: "", fecha_evento: "2026-12-01" }).success).toBe(false);
    expect(esquemaCrearEvento.safeParse({ nombre: "Fiesta", fecha_evento: "" }).success).toBe(false);
    expect(esquemaCrearEvento.safeParse({ nombre: "Fiesta", fecha_evento: "2026-12-01" }).success).toBe(true);
  });

  it("editar exige un id positivo", () => {
    expect(
      esquemaEditarEvento.safeParse({ id: "0", nombre: "Fiesta", fecha_evento: "2026-12-01" }).success,
    ).toBe(false);
  });
});

describe("esquemaCrearLiquidacion", () => {
  it("rechaza montos negativos", () => {
    expect(
      esquemaCrearLiquidacion.safeParse({
        organizador_id: "1",
        periodo_inicio: "2026-01-01",
        periodo_fin: "2026-01-31",
        total_vendido: "-1",
        monto_comision_o_suscripcion: "0",
      }).success,
    ).toBe(false);
  });
});

describe("esquemaRegistroComprador", () => {
  it("exige contraseña de al menos 8 caracteres", () => {
    const base = { nombre: "Ana", email: "ana@test.com", telefono: null, cedula: null, tyc_aceptado: "on" };
    expect(esquemaRegistroComprador.safeParse({ ...base, password: "1234567" }).success).toBe(false);
    expect(esquemaRegistroComprador.safeParse({ ...base, password: "12345678" }).success).toBe(true);
  });
});

describe("esquemaRechazarOrganizador / esquemaEditarOrganizador", () => {
  it("rechazar exige un motivo no vacío", () => {
    expect(esquemaRechazarOrganizador.safeParse({ id: "1", motivo: "" }).success).toBe(false);
    expect(esquemaRechazarOrganizador.safeParse({ id: "1", motivo: "Documentación incompleta" }).success).toBe(true);
  });

  it("editar acepta teléfono/RUC ausentes como null", () => {
    const resultado = esquemaEditarOrganizador.parse({ id: "1", nombre: "Org", telefono: null, ruc_facturacion: null });
    expect(resultado.telefono).toBeNull();
    expect(resultado.ruc_facturacion).toBeNull();
  });
});

describe("esquemaAceptarInvitacion", () => {
  it("exige email válido y contraseña de al menos 8 caracteres", () => {
    const base = { token: "abc123", nombre: "Ana" };
    expect(esquemaAceptarInvitacion.safeParse({ ...base, email: "no-valido", password: "12345678" }).success).toBe(
      false,
    );
    expect(esquemaAceptarInvitacion.safeParse({ ...base, email: "ana@test.com", password: "1234567" }).success).toBe(
      false,
    );
    expect(esquemaAceptarInvitacion.safeParse({ ...base, email: "ana@test.com", password: "12345678" }).success).toBe(
      true,
    );
  });
});
