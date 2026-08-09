-- ============================================================================
-- Triggers plpgsql y FKs DEFERRABLE — no representables en el esquema
-- declarativo de Drizzle. Ver plan de migración §4.3/§4.5 y
-- src/db/esquema.ts (comentario de cabecera).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. tickets.actualizado_en se refresca solo en cada UPDATE. El dashboard
--    agrupa cancelaciones por DATE(actualizado_en) — si esto se hiciera desde
--    la app (ej. $onUpdate de Drizzle), cualquier UPDATE crudo por fuera del
--    query builder (un fix manual, el propio script de migración) dejaría
--    agujeros silenciosos en el gráfico. El trigger es la única garantía
--    invariante.
-- ----------------------------------------------------------------------------
CREATE FUNCTION fijar_actualizado_en() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.actualizado_en := now();
  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER trg_tickets_actualizado_en
BEFORE UPDATE ON tickets
FOR EACH ROW
EXECUTE FUNCTION fijar_actualizado_en();
--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- 2. No se puede eliminar una tanda con tickets vendidos. El CHECK
--    chk_tandas_stock ya impide bajar cantidad_total por debajo de lo
--    vendido (equivalente al trg_tandas_stock_bu del MariaDB original, que
--    por eso NO se porta); este trigger cubre el borde teórico de DELETE
--    directo con cantidad_vendida > 0 sin tickets — el FK
--    tickets.tanda_id ON DELETE RESTRICT ya bloquea el caso real.
-- ----------------------------------------------------------------------------
CREATE FUNCTION impedir_borrado_tanda_con_ventas() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.cantidad_vendida > 0 THEN
    RAISE EXCEPTION 'No se puede eliminar una tanda con tickets vendidos. Cancelá o reprogramá el evento.'
      USING ERRCODE = 'EIK01';
  END IF;
  RETURN OLD;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER trg_tandas_delete_bd
BEFORE DELETE ON tandas
FOR EACH ROW
EXECUTE FUNCTION impedir_borrado_tanda_con_ventas();
--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- 3. No se puede eliminar un evento con tickets vigentes (pendiente,
--    disponible o usado). Igual que arriba, el FK tickets.evento_id
--    ON DELETE RESTRICT ya es más estricto (bloquea incluso con tickets
--    anulados), así que en la práctica este trigger no llega a dispararse;
--    se mantiene por paridad literal de mensaje con el sistema PHP.
-- ----------------------------------------------------------------------------
CREATE FUNCTION impedir_borrado_evento_con_tickets() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
    FROM tickets
   WHERE evento_id = OLD.id
     AND estado IN ('pendiente', 'disponible', 'usado');
  IF v_count > 0 THEN
    RAISE EXCEPTION 'No se puede eliminar un evento con tickets vendidos. Cancelá o reprogramá el evento.'
      USING ERRCODE = 'EIK02';
  END IF;
  RETURN OLD;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER trg_eventos_delete_bd
BEFORE DELETE ON eventos
FOR EACH ROW
EXECUTE FUNCTION impedir_borrado_evento_con_tickets();
--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- 4. FKs DEFERRABLE INITIALLY IMMEDIATE — permite que el script de
--    migración de datos (Fase 3) cargue las 13 tablas en una única
--    transacción con `SET CONSTRAINTS ALL DEFERRED`, sin tener que
--    respetar el orden de dependencias fila por fila. En operación normal
--    se comportan exactamente igual que NOT DEFERRABLE (se validan al
--    final de cada sentencia, salvo que algo pida explícitamente diferirlas).
-- ----------------------------------------------------------------------------
ALTER TABLE usuarios ALTER CONSTRAINT fk_usuarios_invitado_por DEFERRABLE INITIALLY IMMEDIATE;
--> statement-breakpoint
ALTER TABLE eventos ALTER CONSTRAINT fk_eventos_organizador DEFERRABLE INITIALLY IMMEDIATE;
--> statement-breakpoint
ALTER TABLE tandas ALTER CONSTRAINT fk_tandas_evento DEFERRABLE INITIALLY IMMEDIATE;
--> statement-breakpoint
ALTER TABLE asientos ALTER CONSTRAINT fk_asientos_tanda DEFERRABLE INITIALLY IMMEDIATE;
--> statement-breakpoint
ALTER TABLE tickets ALTER CONSTRAINT fk_tickets_evento DEFERRABLE INITIALLY IMMEDIATE;
--> statement-breakpoint
ALTER TABLE tickets ALTER CONSTRAINT fk_tickets_tanda DEFERRABLE INITIALLY IMMEDIATE;
--> statement-breakpoint
ALTER TABLE tickets ALTER CONSTRAINT fk_tickets_asiento DEFERRABLE INITIALLY IMMEDIATE;
--> statement-breakpoint
ALTER TABLE tickets ALTER CONSTRAINT fk_tickets_comprador DEFERRABLE INITIALLY IMMEDIATE;
--> statement-breakpoint
ALTER TABLE tickets ALTER CONSTRAINT fk_tickets_aprobado_por DEFERRABLE INITIALLY IMMEDIATE;
--> statement-breakpoint
ALTER TABLE pagos ALTER CONSTRAINT fk_pagos_ticket DEFERRABLE INITIALLY IMMEDIATE;
--> statement-breakpoint
ALTER TABLE staff_eventos ALTER CONSTRAINT fk_staff_eventos_staff DEFERRABLE INITIALLY IMMEDIATE;
--> statement-breakpoint
ALTER TABLE staff_eventos ALTER CONSTRAINT fk_staff_eventos_evento DEFERRABLE INITIALLY IMMEDIATE;
--> statement-breakpoint
ALTER TABLE staff_invitaciones ALTER CONSTRAINT fk_staff_invitaciones_organizador DEFERRABLE INITIALLY IMMEDIATE;
--> statement-breakpoint
ALTER TABLE staff_invitaciones ALTER CONSTRAINT fk_staff_invitaciones_evento DEFERRABLE INITIALLY IMMEDIATE;
--> statement-breakpoint
ALTER TABLE organizador_suscripciones ALTER CONSTRAINT fk_organizador_suscripciones_organizador DEFERRABLE INITIALLY IMMEDIATE;
--> statement-breakpoint
ALTER TABLE organizador_suscripciones ALTER CONSTRAINT fk_organizador_suscripciones_plan DEFERRABLE INITIALLY IMMEDIATE;
--> statement-breakpoint
ALTER TABLE liquidaciones ALTER CONSTRAINT fk_liquidaciones_organizador DEFERRABLE INITIALLY IMMEDIATE;
--> statement-breakpoint
ALTER TABLE reembolsos ALTER CONSTRAINT fk_reembolsos_ticket DEFERRABLE INITIALLY IMMEDIATE;
--> statement-breakpoint
ALTER TABLE reembolsos ALTER CONSTRAINT fk_reembolsos_evento DEFERRABLE INITIALLY IMMEDIATE;
--> statement-breakpoint
ALTER TABLE faq_base_conocimiento ALTER CONSTRAINT fk_faq_organizador DEFERRABLE INITIALLY IMMEDIATE;
