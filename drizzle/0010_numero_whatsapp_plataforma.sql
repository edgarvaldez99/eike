-- ============================================================================
-- Número de WhatsApp del superadmin (dato de la plataforma, mismo criterio
-- que el alias bancario de 0009) — a diferencia de ese alias, este SÍ se
-- muestra en el checkout público: es el número al que el comprador manda
-- su comprobante de pago tras una compra normal o por carrito.
-- ============================================================================

ALTER TABLE usuarios ADD COLUMN numero_whatsapp varchar(30);
