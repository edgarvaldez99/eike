import type { MetadataRoute } from "next";

const SITE_URL = process.env.SITE_URL || "https://eike.com.py";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/panel", "/staff/aceptar", "/api", "/entradas"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
