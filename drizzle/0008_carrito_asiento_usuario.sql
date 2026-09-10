-- ============================================================================
-- Fase 6 del plan de mejoras (Cambios_web.txt) — ampliación del carrito:
--  1) Selección de asiento específico al agregar al carrito (antes: siempre
--     se auto-asignaba recién en el checkout). uq_carrito_items_asiento es
--     lo que hace estructuralmente imposible que un mismo asiento termine
--     en dos carritos a la vez.
--  2) Fusión de carrito entre dispositivos: carritos.usuario_id se fija al
--     agregar un ítem estando logueado, y se consulta al iniciar sesión en
--     otro dispositivo (ver server/carrito.ts::adoptarCarritoDeCuenta).
-- ============================================================================

ALTER TABLE carritos ADD COLUMN usuario_id bigint;
--> statement-breakpoint
CREATE INDEX idx_carritos_usuario_activo ON carritos (usuario_id, creado_en) WHERE estado = 'activo';
--> statement-breakpoint
ALTER TABLE carritos ADD CONSTRAINT fk_carritos_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL;
--> statement-breakpoint

ALTER TABLE carrito_items ADD COLUMN asiento_id bigint;
--> statement-breakpoint

-- La unique de la 0007 (una fila por carrito+tanda, sin importar asiento)
-- se reemplaza por dos parciales: una para las filas "agregadas" (sin
-- asiento fijo) y otra que asegura que un asiento nunca esté en dos
-- carritos a la vez.
DROP INDEX uq_carrito_items_carrito_tanda;
--> statement-breakpoint
CREATE UNIQUE INDEX uq_carrito_items_carrito_tanda_general ON carrito_items (carrito_id, tanda_id) WHERE asiento_id IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX uq_carrito_items_asiento ON carrito_items (asiento_id) WHERE asiento_id IS NOT NULL;
--> statement-breakpoint

ALTER TABLE carrito_items ADD CONSTRAINT fk_carrito_items_asiento FOREIGN KEY (asiento_id) REFERENCES asientos(id) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE carrito_items ADD CONSTRAINT chk_carrito_items_asiento_cantidad_uno CHECK (asiento_id IS NULL OR cantidad = 1);
