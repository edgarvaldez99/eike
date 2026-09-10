-- ============================================================================
-- Fase 4 del plan de mejoras (Cambios_web.txt) — snapshot de precio en el
-- ticket + trigger que mantiene tandas.cantidad_vendida solo. Sin
-- descuentos todavía (eso es la Fase 7, cupones): esta migración es
-- verificable contra los números actuales, porque no cambia ningún total.
--
-- Bug real que arregla: tandas.precio es mutable (el organizador la edita
-- en cualquier momento) y hasta ahora TODOS los reportes calculaban el
-- ingreso de un ticket con SUM(tandas.precio) — un cambio de precio a mitad
-- de venta reescribía retroactivamente la plata de tickets YA vendidos. De
-- acá en más cada ticket guarda su propio precio, congelado al comprar.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Columnas planas primero (no reescriben la tabla en PG >= 11: son
--    DEFAULT constante). La columna GENERATED va DESPUÉS del backfill, no
--    antes — si no, "generated" tomaría 0 - 0 = 0 para todo lo histórico.
-- ----------------------------------------------------------------------------
ALTER TABLE tickets ADD COLUMN precio_unitario bigint NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE tickets ADD COLUMN descuento bigint NOT NULL DEFAULT 0;
--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- 2. Backfill del precio histórico: el precio de la tanda en este momento
--    (última vez que se puede leer de ahí con sentido), 0 para cortesías
--    (nunca tuvieron costo real — mantiene la semántica de los reportes que
--    ya filtran NOT es_cortesia para la plata). Es un snapshot de una sola
--    vez: de acá en adelante cada compra nueva escribe el suyo.
-- ----------------------------------------------------------------------------
UPDATE tickets tk
   SET precio_unitario = CASE WHEN tk.es_cortesia THEN 0 ELSE td.precio END
  FROM tandas td
 WHERE td.id = tk.tanda_id;
--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- 3. Columna generada: la relación precio_pagado = precio_unitario -
--    descuento pasa a ser una garantía estructural (STORED), no una
--    convención de la app. Esta sí reescribe la tabla entera (ACCESS
--    EXCLUSIVE) — tickets es chica hoy, pero conviene correr el deploy en
--    ventana de baja carga.
-- ----------------------------------------------------------------------------
ALTER TABLE tickets ADD COLUMN precio_pagado bigint GENERATED ALWAYS AS (precio_unitario - descuento) STORED NOT NULL;
--> statement-breakpoint

ALTER TABLE tickets ADD CONSTRAINT chk_tickets_precio_unitario_no_negativo CHECK (precio_unitario >= 0);
--> statement-breakpoint
ALTER TABLE tickets ADD CONSTRAINT chk_tickets_descuento_no_negativo CHECK (descuento >= 0);
--> statement-breakpoint
ALTER TABLE tickets ADD CONSTRAINT chk_tickets_descuento_max CHECK (descuento <= precio_unitario);
--> statement-breakpoint

-- ----------------------------------------------------------------------------
-- 4. trg_tickets_stock: reemplaza los `cantidad_vendida = cantidad_vendida
--    +/- 1` que hasta ahora escribía la app a mano en tres lugares distintos
--    (comprarTicket, rechazarTicket/anularYLiberarStock, crearCortesia) —
--    cualquier código nuevo que inserte o anule un ticket sin acordarse de
--    tocar tandas.cantidad_vendida lo dejaba desincronizado, en silencio.
--    Ahora es un trigger: no hay forma de que un ticket cambie de/a
--    'anulado' sin que el stock de su tanda se actualice con él. De paso
--    absorbe la transición automática activa<->agotada de la Fase 2, que
--    hasta ahora vivía repetida en el mismo lugar del código de la app.
--
--    'pendiente' y 'disponible' cuentan como vendido (reservan stock desde
--    que se crean, igual que hoy); solo 'anulado' lo libera. Cubre INSERT,
--    UPDATE (de/hacia 'anulado') y DELETE (tickets no se borran hoy, pero
--    por completitud).
-- ----------------------------------------------------------------------------
CREATE FUNCTION mantener_stock_tanda() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.estado <> 'anulado' THEN
      UPDATE tandas
         SET cantidad_vendida = cantidad_vendida + 1,
             estado = CASE WHEN cantidad_vendida + 1 >= cantidad_total THEN 'agotada' ELSE estado END
       WHERE id = NEW.tanda_id;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.estado <> 'anulado' AND NEW.estado = 'anulado' THEN
      UPDATE tandas
         SET cantidad_vendida = GREATEST(cantidad_vendida - 1, 0),
             estado = CASE WHEN estado = 'agotada' THEN 'activa' ELSE estado END
       WHERE id = NEW.tanda_id;
    ELSIF OLD.estado = 'anulado' AND NEW.estado <> 'anulado' THEN
      UPDATE tandas
         SET cantidad_vendida = cantidad_vendida + 1,
             estado = CASE WHEN cantidad_vendida + 1 >= cantidad_total THEN 'agotada' ELSE estado END
       WHERE id = NEW.tanda_id;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.estado <> 'anulado' THEN
      UPDATE tandas
         SET cantidad_vendida = GREATEST(cantidad_vendida - 1, 0),
             estado = CASE WHEN estado = 'agotada' THEN 'activa' ELSE estado END
       WHERE id = OLD.tanda_id;
    END IF;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER trg_tickets_stock
AFTER INSERT OR DELETE OR UPDATE OF estado ON tickets
FOR EACH ROW
EXECUTE FUNCTION mantener_stock_tanda();
