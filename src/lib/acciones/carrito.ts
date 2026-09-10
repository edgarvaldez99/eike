"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { usuarioActual } from "@/lib/auth/sesion";
import { leerTokenCarrito, escribirTokenCarrito } from "@/lib/carrito/cookie";
import {
  agregarItemCarrito,
  actualizarCantidadItemCarrito,
  checkoutCarrito,
  crearCarrito,
  obtenerCarritoUtilizablePorToken,
  obtenerResumenCarrito,
  quitarItemCarrito,
  vincularCarritoAUsuario,
} from "@/server/carrito";
import { previsualizarCuponCarrito } from "@/server/cupones";
import { prepararComprobante } from "@/lib/archivos/comprobante";
import { ipCliente, limitar } from "@/lib/rateLimit";
import { ErrorNegocio } from "@/lib/errores";
import { mensajeAmigablePg } from "@/lib/errores-pg";
import {
  esquemaActualizarCantidadCarrito,
  esquemaAgregarAlCarrito,
  esquemaCheckoutCarrito,
  esquemaQuitarDelCarrito,
} from "@/lib/validaciones/carrito";
import { accionPublica } from "./marco";

/** Carrito de la cookie actual, creando uno nuevo (y pisando la cookie) si
 * no hay ninguno utilizable — solo se puede llamar desde acá (Server
 * Action), nunca desde un Server Component en render (no puede escribir
 * cookies). Si hay una cuenta logueada, lo vincula (fusión entre
 * dispositivos, ver server/carrito.ts::vincularCarritoAUsuario) — no-op si
 * ya estaba vinculado. */
async function carritoUtilizableOCrear() {
  const token = await leerTokenCarrito();
  const existente = await obtenerCarritoUtilizablePorToken(token);
  const carrito =
    existente ??
    (await (async () => {
      const nuevo = await crearCarrito();
      await escribirTokenCarrito(nuevo.token);
      return nuevo;
    })());

  const usuario = await usuarioActual();
  if (usuario && (usuario.rol === "comprador" || usuario.rol === "superadmin")) {
    await vincularCarritoAUsuario(carrito.id, usuario.id);
  }

  return carrito;
}

async function carritoUtilizableExistente() {
  const token = await leerTokenCarrito();
  const carrito = await obtenerCarritoUtilizablePorToken(token);
  if (!carrito) {
    throw new ErrorNegocio("Tu carrito venció. Volvé a agregar las entradas que querías comprar.");
  }
  return carrito;
}

export const agregarAlCarritoAction = accionPublica({
  esquema: esquemaAgregarAlCarrito,
  ejecutar: async (datos) => {
    const carrito = await carritoUtilizableOCrear();
    await agregarItemCarrito(carrito.id, {
      tandaId: datos.tanda_id,
      cantidad: datos.cantidad,
      asientoId: datos.asiento_id ?? null,
    });
    revalidatePath("/carrito");
  },
});

export const actualizarCantidadCarritoAction = accionPublica({
  esquema: esquemaActualizarCantidadCarrito,
  ejecutar: async (datos) => {
    const carrito = await carritoUtilizableExistente();
    await actualizarCantidadItemCarrito(carrito.id, datos.item_id, datos.cantidad);
    revalidatePath("/carrito");
  },
});

export const quitarDelCarritoAction = accionPublica({
  esquema: esquemaQuitarDelCarrito,
  ejecutar: async (datos) => {
    const carrito = await carritoUtilizableExistente();
    await quitarItemCarrito(carrito.id, datos.item_id);
    revalidatePath("/carrito");
  },
});

/**
 * Previsualización de cupón sobre TODO el carrito — de solo lectura, no lo
 * consume (mismo criterio que previsualizarCuponAction en
 * tickets-publico.ts). Se llama directo desde un evento de clic del
 * cliente, no es un <form action>.
 */
export async function previsualizarCuponCarritoAction(
  codigo: string,
): Promise<{ ok: true; descuento: number; total: number } | { ok: false; error: string }> {
  const ip = await ipCliente();
  const { permitido, reintentarEnSegundos } = limitar(`cupon-carrito-preview:${ip}`, {
    maximo: 20,
    ventanaMs: 60 * 1000,
  });
  if (!permitido) {
    return { ok: false, error: `Demasiados intentos. Probá de nuevo en ${reintentarEnSegundos}s.` };
  }

  try {
    const token = await leerTokenCarrito();
    const carrito = await obtenerCarritoUtilizablePorToken(token);
    if (!carrito || carrito.organizadorId === null) {
      return { ok: false, error: "Tu carrito está vacío." };
    }
    const resumen = await obtenerResumenCarrito(carrito.id);
    const previa = await previsualizarCuponCarrito({
      codigo,
      organizadorId: carrito.organizadorId,
      items: resumen.items.map((it) => ({ tandaId: it.tandaId, eventoId: it.eventoId, subtotal: it.subtotal })),
    });
    return { ok: true, descuento: previa.descuentoTotal, total: previa.total };
  } catch (error) {
    if (error instanceof ErrorNegocio) {
      return { ok: false, error: error.message };
    }
    const amigablePg = mensajeAmigablePg(error);
    if (amigablePg) {
      return { ok: false, error: amigablePg };
    }
    console.error("Error inesperado al previsualizar un cupón de carrito:", error);
    return { ok: false, error: "No se pudo validar el cupón. Probá de nuevo en un momento." };
  }
}

/**
 * Checkout del carrito — invitado o comprador logueado, no puede pasar por
 * accionSegura() (permite sesión ausente a propósito). Puerto de
 * comprarTicketAction (tickets-publico.ts) generalizado a varios ítems.
 */
export const checkoutCarritoAction = accionPublica({
  esquema: esquemaCheckoutCarrito,
  ejecutar: async (datos, fd) => {
    const ip = await ipCliente();
    const { permitido, reintentarEnSegundos } = limitar(`checkout-carrito:${ip}`, { maximo: 20, ventanaMs: 60 * 1000 });
    if (!permitido) {
      throw new ErrorNegocio(`Demasiados intentos. Probá de nuevo en ${reintentarEnSegundos}s.`);
    }

    const carrito = await carritoUtilizableExistente();

    const usuario = await usuarioActual();
    // Un organizador/staff logueado no "compra" con su propia cuenta (igual que comprarTicketAction).
    const compradorSesion = usuario && (usuario.rol === "comprador" || usuario.rol === "superadmin") ? usuario : null;
    if (!compradorSesion && !datos.tyc_aceptado) {
      throw new ErrorNegocio("Hay que aceptar los Términos y Condiciones / Política de Privacidad.");
    }

    const archivoCrudo = fd?.get("comprobante");
    const tieneArchivo = archivoCrudo instanceof File && archivoCrudo.size > 0;
    const comprobante = tieneArchivo ? await prepararComprobante(archivoCrudo as File) : null;

    // Fase 8: la atribución de referido se resuelve recién ACÁ, al
    // checkout (no se congela al crear el carrito, ver esquema.ts) — misma
    // cookie de solo lectura que ya usa comprarTicketAction.
    const codigoReferido = (await cookies()).get("eike_ref")?.value ?? null;

    const resultado = await checkoutCarrito(carrito.id, compradorSesion?.id ?? null, {
      nombreComprador: datos.nombre_comprador,
      cedula: datos.cedula,
      email: datos.email,
      contacto: datos.contacto,
      comprobanteTexto: datos.comprobante_texto,
      comprobante,
      codigoCupon: datos.codigo_cupon,
      codigoReferido,
    });

    // El carrito quedó 'completado' — el indicador del header (en el layout
    // público, que envuelve TODA página pública) tiene que dejar de contar
    // sus unidades. Sin este revalidate, el router del cliente arrastra el
    // layout ya renderizado de la navegación anterior y el conteo queda
    // stale hasta el próximo refresh/navegación.
    revalidatePath("/", "layout");
    redirect(`/entradas/orden/${resultado.orden.codigo}`);
  },
});
