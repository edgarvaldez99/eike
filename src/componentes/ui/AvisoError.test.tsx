import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AvisoError } from "./AvisoError";

describe("AvisoError", () => {
  it("no renderiza nada sin mensaje", () => {
    const { container } = render(<AvisoError mensaje={undefined} />);
    expect(container.firstChild).toBeNull();
  });

  it("renderiza role=alert y mueve el foco al aparecer", () => {
    render(<AvisoError mensaje="Revisá los datos del formulario." />);
    const aviso = screen.getByRole("alert");
    expect(aviso.textContent).toBe("Revisá los datos del formulario.");
    expect(document.activeElement).toBe(aviso);
  });
});
