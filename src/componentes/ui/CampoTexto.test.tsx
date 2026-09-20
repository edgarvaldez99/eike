import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CampoTexto } from "./CampoTexto";

describe("CampoTexto", () => {
  it("asocia la etiqueta al input aunque no se pase `name` ni `id`", () => {
    // Caso real: EscanerCamara.tsx usa CampoTexto sin `name` (el valor viaja
    // por estado de React, no por FormData) — antes del fix a useId(), el
    // fallback `id ?? name` dejaba htmlFor={undefined} y el label quedaba
    // huérfano.
    render(<CampoTexto etiqueta="Código manual" />);
    const input = screen.getByLabelText("Código manual");
    expect(input.tagName).toBe("INPUT");
  });

  it("genera ids distintos entre dos instancias sin `name`", () => {
    render(
      <>
        <CampoTexto etiqueta="Campo uno" />
        <CampoTexto etiqueta="Campo dos" />
      </>,
    );
    const uno = screen.getByLabelText("Campo uno") as HTMLInputElement;
    const dos = screen.getByLabelText("Campo dos") as HTMLInputElement;
    expect(uno.id).not.toBe("");
    expect(uno.id).not.toBe(dos.id);
  });

  it("cablea aria-describedby y aria-invalid cuando hay error", () => {
    render(<CampoTexto etiqueta="Email" name="email" error="Ese email no parece válido." />);
    const input = screen.getByLabelText("Email");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    const idDescripcion = input.getAttribute("aria-describedby");
    expect(idDescripcion).toBeTruthy();
    const mensaje = document.getElementById(idDescripcion!);
    expect(mensaje?.textContent).toBe("Ese email no parece válido.");
  });

  it("no agrega aria-describedby/aria-invalid sin error", () => {
    render(<CampoTexto etiqueta="Nombre" name="nombre" />);
    const input = screen.getByLabelText("Nombre");
    expect(input.getAttribute("aria-invalid")).toBeNull();
    expect(input.getAttribute("aria-describedby")).toBeNull();
  });
});
