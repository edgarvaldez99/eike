import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CampoSelect } from "./CampoSelect";

describe("CampoSelect", () => {
  it("asocia la etiqueta visible al select", () => {
    render(
      <CampoSelect etiqueta="Estado" name="estado">
        <option value="">Todos los estados</option>
      </CampoSelect>,
    );
    const select = screen.getByLabelText("Estado");
    expect(select.tagName).toBe("SELECT");
  });

  it("con etiquetaOculta, la etiqueta sigue siendo accesible pero queda visualmente oculta (sr-only)", () => {
    render(
      <CampoSelect etiqueta="Evento" etiquetaOculta name="evento_id">
        <option value="">Todos los eventos</option>
      </CampoSelect>,
    );
    const select = screen.getByLabelText("Evento");
    expect(select.tagName).toBe("SELECT");
    const label = document.querySelector("label")!;
    expect(label.className).toContain("sr-only");
  });
});
