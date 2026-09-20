import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Sin esto, el DOM de un test queda montado para el siguiente (React
// Testing Library no hace auto-cleanup fuera de un entorno Jest, y acá
// `test.globals` está apagado a propósito — ver vitest.config.ts).
afterEach(() => {
  cleanup();
});
