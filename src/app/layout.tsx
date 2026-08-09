import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://eike.com.py"),
  title: {
    default: "Eike — Entradas para eventos en Paraguay",
    template: "%s · Eike",
  },
  description:
    "Comprá y vendé entradas para tus eventos en Paraguay. Eike es la plataforma de tickets con QR, control de aforo y venta 100% online.",
  openGraph: {
    type: "website",
    siteName: "Eike",
    locale: "es_PY",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es-PY" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
