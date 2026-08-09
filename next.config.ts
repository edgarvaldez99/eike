import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Imprescindible para desplegar en la VM de 1 GB de RAM (eike-vm): la imagen
  // Docker final solo lleva node_modules trazados por uso real, no todo el árbol.
  // Ver plan de migración §6.3.
  output: "standalone",
};

export default nextConfig;
