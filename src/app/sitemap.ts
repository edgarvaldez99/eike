import type { MetadataRoute } from "next";
import { obtenerEventosPublicos } from "@/server/eventos";
import { armarSlugEvento } from "@/lib/slug";

const SITE_URL = process.env.SITE_URL || "https://eike.com.py";

// Necesita la base (eventos publicados) — el build de producción corre en
// CI sin acceso a Postgres (ver plan de migración §5.4), así que esto tiene
// que resolverse en cada request, no precalcularse en build time.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const eventos = await obtenerEventosPublicos();

  const estaticas: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/eventos`, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/registrarme`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${SITE_URL}/ingresar`, changeFrequency: "monthly", priority: 0.2 },
  ];

  const deEventos: MetadataRoute.Sitemap = eventos.map((e) => ({
    url: `${SITE_URL}/eventos/${armarSlugEvento(e.id, e.nombre)}`,
    changeFrequency: "daily",
    priority: 0.8,
  }));

  return [...estaticas, ...deEventos];
}
