import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import jsxA11y from "eslint-plugin-jsx-a11y";

// eslint-config-next ya trae un subconjunto mínimo de jsx-a11y (alt-text,
// aria-props, etc.) en "warn". Acá se suma el preset "recommended" completo
// del plugin (label-has-associated-control, click-events-have-key-events,
// no-static-element-interactions, anchor-is-valid, heading-has-content,
// tabindex-no-positive, no-autofocus, aria-role, entre otras) — pero forzado
// a "warn" en vez de "error", para no bloquear el build mientras se migran
// los hallazgos existentes (Fase 3 del plan de mejoras de accesibilidad).
const reglasA11yEnWarn = Object.fromEntries(
  Object.entries(jsxA11y.flatConfigs.recommended.rules)
    // "label-has-for" está deprecada a favor de "label-has-associated-control":
    // por default exige nesting Y htmlFor/id a la vez, así que marca en falso
    // positivo el patrón <label htmlFor> + <input id> ya correcto (W3C permite
    // cualquiera de los dos, no ambos). Se apaga y se deja que
    // "label-has-associated-control" sea la única señal real.
    .filter(([regla]) => regla !== "jsx-a11y/label-has-for")
    .map(([regla, config]) => [regla, Array.isArray(config) ? ["warn", ...config.slice(1)] : "warn"]),
);

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Sin `plugins`/`languageOptions` acá: eslint-config-next ya registra el
  // plugin jsx-a11y (con su propia instancia) y ya habilita JSX en
  // parserOptions — repetirlo con esta segunda instancia del plugin rompe
  // con "Cannot redefine plugin jsx-a11y".
  {
    rules: reglasA11yEnWarn,
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "coverage/**",
  ]),
]);

export default eslintConfig;
