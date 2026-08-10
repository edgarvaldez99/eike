import { defineConfig } from "vitest/config";
import { readFileSync } from "node:fs";
import path from "node:path";

// Carga .env.test a mano (sin dotenv como dependencia extra): el formato es
// simple, KEY=VALUE por línea, sin comillas ni interpolación.
for (const linea of readFileSync(path.resolve(__dirname, ".env.test"), "utf8").split("\n")) {
  const m = linea.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}

export default defineConfig({
  test: {
    globalSetup: "./src/test/setup-global.ts",
    setupFiles: ["./src/test/setup.ts"],
    // Los tests de src/server comparten una sola base de test (eike_test) y
    // truncan las tablas antes de cada test — correr archivos en paralelo
    // pisaría datos entre sí. El costo de serializar es aceptable: el
    // proyecto es chico y la prioridad es que los tests sean confiables.
    fileParallelism: false,
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      // Cobertura enfocada en la lógica de negocio real (server/lib) — no
      // en páginas/componentes React, que se cubren con la regresión manual
      // (QA end-to-end) y no con coverage de unit tests. Ver README §Testing.
      include: ["src/server/**", "src/lib/**"],
      // Los archivos de src/lib/acciones/ (salvo marco.ts, que sí se testea)
      // son cáscaras finas de accionSegura() sobre src/server — sin lógica
      // propia que valga la pena cubrir con unit tests.
      exclude: [
        "src/lib/acciones/admin-usuarios.ts",
        "src/lib/acciones/auth.ts",
        "src/lib/acciones/eventos.ts",
        "src/lib/acciones/liquidaciones.ts",
        "src/lib/acciones/staff-publico.ts",
        "src/lib/acciones/staff.ts",
        "src/lib/acciones/tandas.ts",
        "src/lib/acciones/tickets-publico.ts",
        "src/lib/acciones/tickets.ts",
        "src/lib/acciones/upload.ts",
        "src/lib/acciones/usuarios.ts",
      ],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
