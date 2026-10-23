import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, IBM_Plex_Sans, Inter } from "next/font/google";
import "./globals.css";

// Tipografía de marca (manual_eike.pdf): títulos en Bricolage Grotesque
// Bold, texto corrido en Inter. next/font/google las self-hostea en build
// (sin requests a Google en runtime) y expone --font-inter/--font-bricolage,
// que globals.css usa en --font-sans/--font-titulos.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["700"],
  variable: "--font-bricolage",
  display: "swap",
});

// IBM Plex Sans 500: precios y eyebrows del diseño (docs/GuiaDeEstilos/eike_svg_figma).
const plex = IBM_Plex_Sans({ subsets: ["latin"], weight: ["500"], variable: "--font-plex", display: "swap" });

// Soporta ambos temas (ver globals.css + useTema/SwitcherTema). themeColor
// por @media refleja la preferencia del SISTEMA; cuando el usuario fuerza un
// tema a mano, useTema sincroniza el <meta name="theme-color"> en runtime.
export const viewport: Viewport = {
  colorScheme: "dark light",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f8fa" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0f16" },
  ],
};

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

const jsonLdSitio = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Eike",
  url: "https://eike.com.py",
};

// Setea data-theme en <html> ANTES del primer paint — sin esto, forzar un
// tema a mano (useTema) haría flashear el tema del sistema en cada carga
// hasta que React hidrate.
const scriptTema = `(function(){try{var t=localStorage.getItem("eike-tema");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t);}catch(e){}})();`;

// suppressHydrationWarning abajo: el script no-FOUC escribe data-theme en
// <html> antes de que React hidrate — es la única divergencia esperada
// entre el HTML del servidor y el del cliente.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es-PY"
      className={`h-full antialiased ${inter.variable} ${bricolage.variable} ${plex.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <script dangerouslySetInnerHTML={{ __html: scriptTema }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdSitio) }}
        />
        {children}
      </body>
    </html>
  );
}
