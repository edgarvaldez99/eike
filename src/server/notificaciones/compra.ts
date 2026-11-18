import type { ordenes } from "@/db/esquema";
import { obtenerNumeroWhatsappPlataforma } from "@/server/cuenta";
import { obtenerOrdenParaMostrar } from "@/server/tickets";
import { enviarCorreoCompra, type ResultadoCompra } from "./correo-compra";

/**
 * Avisa por correo al comprador (el email que cargó en su carrito) que su
 * compra fue aprobada o rechazada. Se llama DESPUÉS de que la aprobación o el
 * rechazo ya se guardaron, y NUNCA lanza: si el correo falla, la decisión del
 * superadmin no se revierte ni se muestra como error — solo queda en el log.
 */
export async function notificarResultadoCompra(
  orden: Pick<typeof ordenes.$inferSelect, "codigo" | "nombreComprador" | "email">,
  resultado: ResultadoCompra,
): Promise<void> {
  try {
    const [detalle, numeroWhatsapp] = await Promise.all([
      obtenerOrdenParaMostrar(orden.codigo),
      obtenerNumeroWhatsappPlataforma(),
    ]);
    await enviarCorreoCompra({
      codigo: orden.codigo,
      nombreComprador: orden.nombreComprador,
      email: orden.email,
      eventoNombre: detalle?.eventoNombre ?? "tu evento",
      resultado,
      numeroWhatsapp,
    });
  } catch (error) {
    console.error(`No se pudo enviar el correo de compra ${resultado} (${orden.codigo}):`, error);
  }
}
