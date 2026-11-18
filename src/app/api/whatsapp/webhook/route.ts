import { after, NextResponse } from "next/server";
import { firmaValida } from "@/server/whatsapp/firma";
import { procesarPayload } from "@/server/whatsapp/procesar";

/**
 * Webhook de la WhatsApp Cloud API (Meta). GET = verificación del webhook al
 * configurarlo; POST = mensajes entrantes (comprobantes de pago). Ver el
 * diseño en ticketapi/docs/08-pagos-y-whatsapp.md.
 */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const tokenEsperado = process.env.WHATSAPP_VERIFY_TOKEN;
  if (tokenEsperado && params.get("hub.mode") === "subscribe" && params.get("hub.verify_token") === tokenEsperado) {
    // Meta espera el challenge tal cual, como texto plano.
    return new NextResponse(params.get("hub.challenge") ?? "", { headers: { "Content-Type": "text/plain" } });
  }
  return NextResponse.json({ error: "Verificación fallida." }, { status: 403 });
}

export async function POST(req: Request) {
  const secreto = process.env.WHATSAPP_APP_SECRET;
  if (!secreto) {
    // Sin App Secret no hay forma de autenticar a Meta: mejor deshabilitado
    // que aceptar "comprobantes" de cualquiera.
    return NextResponse.json({ error: "Webhook no configurado." }, { status: 503 });
  }
  const cuerpo = await req.text();
  if (!firmaValida(cuerpo, req.headers.get("x-hub-signature-256"), secreto)) {
    return NextResponse.json({ error: "Firma inválida." }, { status: 403 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(cuerpo);
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }

  // Responder 200 enseguida (Meta reintenta si tardamos) y procesar después:
  // descargar + OCR puede demorar decenas de segundos.
  after(async () => {
    try {
      await procesarPayload(payload);
    } catch (error) {
      console.error("Falló el procesamiento del webhook de WhatsApp:", error instanceof Error ? error.message : error);
    }
  });
  return NextResponse.json({ recibido: true });
}
