"use client";

import { useActionState, useState } from "react";
import { editarOrganizadorAction, inactivarOrganizadorAction, reactivarOrganizadorAction } from "@/lib/acciones/admin-usuarios";
import { Boton } from "@/componentes/ui/Boton";
import { CampoTexto } from "@/componentes/ui/CampoTexto";
import type { EstadoUsuario } from "@/lib/constantes";

interface Organizador {
  id: number;
  nombre: string;
  telefono: string | null;
  rucFacturacion: string | null;
  estado: EstadoUsuario;
}

export function FormularioEditarOrganizador({ organizador }: { organizador: Organizador }) {
  const [editando, setEditando] = useState(false);
  const [estadoEditar, accionEditar, pendienteEditar] = useActionState(editarOrganizadorAction, null);
  const [, accionInactivar, pendienteInactivar] = useActionState(inactivarOrganizadorAction, null);
  const [, accionReactivar, pendienteReactivar] = useActionState(reactivarOrganizadorAction, null);

  if (editando) {
    return (
      <form action={accionEditar} className="flex flex-col gap-2 rounded-[var(--radius-eike-sm)] border border-border-soft p-3">
        <input type="hidden" name="id" value={organizador.id} />
        <CampoTexto etiqueta="Nombre" name="nombre" defaultValue={organizador.nombre} required />
        <CampoTexto etiqueta="Teléfono" name="telefono" defaultValue={organizador.telefono ?? ""} />
        <CampoTexto etiqueta="RUC" name="ruc_facturacion" defaultValue={organizador.rucFacturacion ?? ""} />
        {estadoEditar && !estadoEditar.ok ? <p className="eike-campo-error">{estadoEditar.error}</p> : null}
        <div className="flex gap-2">
          <Boton type="submit" tamano="sm" disabled={pendienteEditar}>
            {pendienteEditar ? "Guardando…" : "Guardar"}
          </Boton>
          <Boton type="button" variante="ghost" tamano="sm" onClick={() => setEditando(false)}>
            Cancelar
          </Boton>
        </div>
      </form>
    );
  }

  return (
    <div className="flex gap-2">
      <Boton variante="ghost" tamano="sm" onClick={() => setEditando(true)}>
        Editar
      </Boton>
      {organizador.estado === "inactivo" ? (
        <form action={accionReactivar}>
          <input type="hidden" name="id" value={organizador.id} />
          <Boton tamano="sm" disabled={pendienteReactivar}>
            {pendienteReactivar ? "…" : "Reactivar"}
          </Boton>
        </form>
      ) : organizador.estado === "activo" || organizador.estado === "mora" ? (
        <form
          action={accionInactivar}
          onSubmit={(e) => {
            if (!confirm("¿Dar de baja a este organizador? Sus eventos publicados no se ven afectados.")) {
              e.preventDefault();
            }
          }}
        >
          <input type="hidden" name="id" value={organizador.id} />
          <Boton variante="ghost" tamano="sm" disabled={pendienteInactivar}>
            {pendienteInactivar ? "…" : "Dar de baja"}
          </Boton>
        </form>
      ) : null}
    </div>
  );
}
