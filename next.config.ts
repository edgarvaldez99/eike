import type { NextConfig } from "next";

// Headers de seguridad de base (Fase 8 — endurecimiento). No incluye una CSP
// estricta con nonces: Next.js necesita "unsafe-inline" para su script de
// bootstrap salvo que se configure un middleware de nonce por request, que
// queda fuera de alcance por ahora — igual bloquea los vectores más baratos
// (objetos embebidos, iframes de terceros, MIME sniffing).
const HEADERS_SEGURIDAD = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // camera=(self): el escáner (BarcodeDetector + getUserMedia) lo necesita.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=()" },
  // No tiene efecto sobre HTTP plano (Fase 7, pruebas por IP) — el navegador
  // solo lo respeta si llega por una conexión HTTPS real (Fase 10, cutover).
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self'",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  // Imprescindible para desplegar en la VM de 1 GB de RAM (eike-vm): la imagen
  // Docker final solo lleva node_modules trazados por uso real, no todo el árbol.
  // Ver plan de migración §6.3.
  output: "standalone",
  async headers() {
    return [{ source: "/:path*", headers: HEADERS_SEGURIDAD }];
  },
};

export default nextConfig;
