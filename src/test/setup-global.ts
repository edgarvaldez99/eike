import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

// globalSetup corre en un contexto propio (una sola vez para toda la corrida)
// — carga .env.test de nuevo por las dudas, no asume el process.env del config.
function cargarEnvTest() {
  const raiz = path.resolve(__dirname, "../..");
  for (const linea of readFileSync(path.join(raiz, ".env.test"), "utf8").split("\n")) {
    const m = linea.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) process.env[m[1]] = m[2];
  }
  return raiz;
}

export default function setup() {
  const raiz = cargarEnvTest();
  // Aplica el esquema completo (drizzle/*.sql, con los triggers plpgsql) a
  // eike_test antes de correr cualquier test — misma fuente de verdad que
  // producción, no una versión "simplificada" del esquema.
  execSync("npx drizzle-kit migrate", {
    cwd: raiz,
    env: process.env,
    stdio: "inherit",
  });
}
