import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { GrupoOpciones } from "./GrupoOpciones";

describe("GrupoOpciones", () => {
  it("agrupa los radios en un fieldset con legend real", () => {
    render(
      <GrupoOpciones etiqueta="Aplica a">
        <label>
          <input type="radio" name="alcance" value="evento" defaultChecked />
          Solo este evento
        </label>
        <label>
          <input type="radio" name="alcance" value="todos" />
          Todos mis eventos
        </label>
      </GrupoOpciones>,
    );
    // getByRole("group", { name }) exige que el fieldset tenga un accessible
    // name derivado de su <legend> — si el texto quedara como <span> suelto
    // (el patrón anterior) esta query no encontraría nada.
    const grupo = screen.getByRole("group", { name: "Aplica a" });
    expect(grupo.tagName).toBe("FIELDSET");
    expect(screen.getAllByRole("radio")).toHaveLength(2);
  });
});
