import type { ordenes } from "@/db/esquema";
import { obtenerNumeroWhatsappPlataforma } from "@/server/cuenta";
import { obtenerOrdenParaMostrar } from "@/server/tickets";
import { avisarResultadoPorWhatsapp } from "@/server/whatsapp/avisos";
import { enviarCorreoCompra, type ResultadoCompra } from "./correo-compra";

/**
 * Avisa al comprador que su compra fue aprobada o rechazada: por correo (el
 * email que cargó en su carrito, siempre) y, además, por WhatsApp si dejó un
 * número de contacto. Se llama DESPUÉS de que la aprobación o el rechazo ya se
 * guardaron, y NUNCA lanza: si un canal falla, la decisión del superadmin no
 * se revierte ni se muestra como error — solo queda en el log, y el otro canal
 * se intenta igual.
 */
export async function notificarResultadoCompra(
  orden: Pick<typeof ordenes.$inferSelect, "codigo" | "nombreComprador" | "email"> &
    Partial<Pick<typeof ordenes.$inferSelect, "id" | "contacto">>,
  resultado: ResultadoCompra,
): Promise<void> {
  try {
    const [detalle, numeroWhatsapp] = await Promise.all([
      obtenerOrdenParaMostrar(orden.codigo),
      obtenerNumeroWhatsappPlataforma(),
    ]);
    const eventoNombre = detalle?.eventoNombre ?? "tu evento";

    if (orden.id !== undefined && orden.contacto) {
      await avisarResultadoPorWhatsapp({
        ordenId: orden.id,
        codigo: orden.codigo,
        nombreComprador: orden.nombreComprador,
        contacto: orden.contacto,
        eventoNombre,
        resultado,
        numeroWhatsapp,
      });
    }

    await enviarCorreoCompra({
      codigo: orden.codigo,
      nombreComprador: orden.nombreComprador,
      email: orden.email,
      eventoNombre,
      resultado,
      numeroWhatsapp,
    });
  } catch (error) {
    console.error(`No se pudo enviar el correo de compra ${resultado} (${orden.codigo}):`, error);
  }
}
