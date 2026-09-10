-- ============================================================================
-- Aprobación de eventos por superadmin (pedido anti-estafa, fuera de las 8
-- fases de Cambios_web.txt). Un organizador ya no publica directo: solicita
-- aprobación (borrador/rechazado -> pendiente_aprobacion, de solo lectura),
-- y el superadmin lo aprueba (-> publicado) o lo rechaza con un motivo
-- (-> rechazado, vuelve a ser editable). Reemplaza al gating de
-- aprobacionGratuito, que nunca tuvo una UI real (ver server/eventos.ts).
-- ============================================================================

ALTER TABLE eventos ADD COLUMN motivo_rechazo varchar(255);
--> statement-breakpoint

-- Postgres no tiene ALTER CONSTRAINT para un CHECK — hay que recrearlo
-- entero con la lista de valores ampliada.
ALTER TABLE eventos DROP CONSTRAINT chk_eventos_estado;
--> statement-breakpoint
ALTER TABLE eventos ADD CONSTRAINT chk_eventos_estado
  CHECK (estado in ('borrador', 'pendiente_aprobacion', 'publicado', 'rechazado', 'reprogramado', 'finalizado', 'cancelado'));
