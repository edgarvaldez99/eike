-- ============================================================================
-- Autoedición de perfil (cualquier usuario edita sus propios datos y
-- contraseña, ver server/cuenta.ts) + alias bancario del superadmin (dato
-- de la plataforma, para el mensaje de WhatsApp con las instrucciones de
-- pago — nunca se muestra en el checkout).
-- ============================================================================

ALTER TABLE usuarios ADD COLUMN alias_bancario_tipo text;
--> statement-breakpoint
ALTER TABLE usuarios ADD COLUMN alias_bancario_valor varchar(100);
--> statement-breakpoint
ALTER TABLE usuarios ADD CONSTRAINT chk_usuarios_alias_bancario_tipo
  CHECK (alias_bancario_tipo in ('ruc', 'cedula', 'telefono', 'correo'));
