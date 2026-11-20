ALTER TABLE "comprobantes_whatsapp" ADD COLUMN "origen" text DEFAULT 'whatsapp' NOT NULL;--> statement-breakpoint
ALTER TABLE "comprobantes_whatsapp" ADD COLUMN "cuenta_destino" varchar(40);--> statement-breakpoint
ALTER TABLE "comprobantes_whatsapp" ADD COLUMN "fecha_operacion" varchar(40);--> statement-breakpoint
ALTER TABLE "comprobantes_whatsapp" ADD COLUMN "coincidencias" varchar(120);--> statement-breakpoint
ALTER TABLE "comprobantes_whatsapp" ADD CONSTRAINT "chk_comprobantes_wa_origen" CHECK ("comprobantes_whatsapp"."origen" in ('whatsapp', 'carrito'));