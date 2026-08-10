import { db } from "@/db/cliente";
import { asientos, eventos, tandas, tickets, usuarios } from "@/db/esquema";
import { hashearPassword } from "@/lib/auth/password";
import type { EstadoAsiento, EstadoEvento, EstadoTanda, EstadoTicket, EstadoUsuario, Rol, TipoTanda } from "@/lib/constantes";

/**
 * Factories mínimas para armar precondiciones en los tests de integración
 * de src/server/** — insertan directo por Drizzle (no pasan por Server
 * Actions ni por la lógica bajo test) para no acoplar un test a otra pieza
 * de lógica de negocio.
 */

export async function crearUsuario(datos: {
  rol: Rol;
  estado?: EstadoUsuario;
  nombre?: string;
  email?: string;
  password?: string;
}) {
  const [fila] = await db
    .insert(usuarios)
    .values({
      nombre: datos.nombre ?? "Usuario de test",
      email: datos.email ?? `test-${Math.random().toString(36).slice(2)}@test.com`,
      passwordHash: await hashearPassword(datos.password ?? "test1234"),
      rol: datos.rol,
      estado: datos.estado ?? "activo",
    })
    .returning({ id: usuarios.id });
  return fila.id;
}

export async function crearEvento(datos: {
  organizadorId: number;
  estado?: EstadoEvento;
  nombre?: string;
  fechaEvento?: Date;
  esGratuito?: boolean;
}) {
  const [fila] = await db
    .insert(eventos)
    .values({
      organizadorId: datos.organizadorId,
      nombre: datos.nombre ?? "Evento de test",
      fechaEvento: datos.fechaEvento ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      estado: datos.estado ?? "publicado",
      esGratuito: datos.esGratuito ?? false,
    })
    .returning({ id: eventos.id });
  return fila.id;
}

export async function crearTanda(datos: {
  eventoId: number;
  nombre?: string;
  tipo?: TipoTanda;
  precio?: number;
  cantidadTotal?: number;
  cantidadVendida?: number;
  estado?: EstadoTanda;
}) {
  const [fila] = await db
    .insert(tandas)
    .values({
      eventoId: datos.eventoId,
      nombre: datos.nombre ?? "General",
      tipo: datos.tipo ?? "general",
      precio: datos.precio ?? 50000,
      cantidadTotal: datos.cantidadTotal ?? 10,
      cantidadVendida: datos.cantidadVendida ?? 0,
      estado: datos.estado ?? "activa",
    })
    .returning({ id: tandas.id });
  return fila.id;
}

export async function crearAsiento(datos: {
  tandaId: number;
  identificador?: string;
  estado?: EstadoAsiento;
}) {
  const [fila] = await db
    .insert(asientos)
    .values({
      tandaId: datos.tandaId,
      identificador: datos.identificador ?? `A-${Math.floor(Math.random() * 100000)}`,
      estado: datos.estado ?? "disponible",
    })
    .returning({ id: asientos.id });
  return fila.id;
}

export async function crearTicket(datos: {
  eventoId: number;
  tandaId: number;
  asientoId?: number | null;
  compradorId?: number | null;
  estado?: EstadoTicket;
  codigo?: string;
  nombreComprador?: string;
  email?: string;
}) {
  const [fila] = await db
    .insert(tickets)
    .values({
      eventoId: datos.eventoId,
      tandaId: datos.tandaId,
      asientoId: datos.asientoId ?? null,
      compradorId: datos.compradorId ?? null,
      estado: datos.estado ?? "disponible",
      codigo: datos.codigo ?? `EIK-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
      nombreComprador: datos.nombreComprador ?? "Comprador de test",
      email: datos.email ?? "comprador@test.com",
    })
    .returning({ id: tickets.id });
  return fila.id;
}
