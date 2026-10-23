import { cn } from "@/lib/cn";

export type NombreIcono =
  | "carrito"
  | "ticket"
  | "calendario"
  | "ubicacion"
  | "whatsapp"
  | "compartir"
  | "imprimir"
  | "cerrar"
  | "mas"
  | "menos"
  | "flecha"
  | "chevron"
  | "check"
  | "alerta"
  | "sol"
  | "luna"
  | "monitor"
  | "facebook"
  | "x"
  | "instagram";

const ROTACION: Record<string, number> = {
  derecha: 0,
  abajo: 90,
  izquierda: 180,
  arriba: 270,
  "arriba-derecha": -45,
};

const TRAZOS: Record<NombreIcono, React.ReactNode> = {
  carrito: (
    <>
      <circle cx="9" cy="20" r="1" />
      <circle cx="18" cy="20" r="1" />
      <path d="M2 3h2l2.4 12.2a2 2 0 0 0 2 1.8h8.4a2 2 0 0 0 2-1.6L21 8H6" />
    </>
  ),
  ticket: (
    <>
      <path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2.2a1.8 1.8 0 0 0 0 3.6V16a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2.2a1.8 1.8 0 0 0 0-3.6Z" />
      <path d="M13.5 6v2.5M13.5 11.25v1.5M13.5 16v2" />
    </>
  ),
  calendario: (
    <>
      <rect x="3" y="4.5" width="18" height="16" rx="2" />
      <path d="M16 2.5v4M8 2.5v4M3 9.5h18" />
    </>
  ),
  ubicacion: (
    <>
      <path d="M12 21.5s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12Z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </>
  ),
  whatsapp: (
    <>
      <path d="M21 11.5a8.5 8.5 0 0 1-12.35 7.57L3 20l1.02-4.5A8.5 8.5 0 1 1 21 11.5Z" />
      <path d="M8.5 10.3c.3 2.6 2.5 4.8 5.1 5.1" />
    </>
  ),
  compartir: (
    <>
      <circle cx="18" cy="5" r="2.5" />
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="19" r="2.5" />
      <path d="M8.3 10.6 15.7 6.4M8.3 13.4l7.4 4.2" />
    </>
  ),
  imprimir: (
    <>
      <path d="M6 9V3.5h12V9" />
      <rect x="4" y="9" width="16" height="8" rx="1.5" />
      <path d="M6 17v3.5h12V17" />
    </>
  ),
  cerrar: <path d="M6 6l12 12M18 6 6 18" />,
  mas: <path d="M12 5v14M5 12h14" />,
  menos: <path d="M5 12h14" />,
  flecha: <path d="M4.5 12h15M13 6l6.5 6-6.5 6" />,
  chevron: <path d="M6 9l6 6 6-6" />,
  check: <path d="M5 13l4 4L19 7" />,
  alerta: (
    <>
      <path d="M12 3 2 20h20L12 3Z" />
      <path d="M12 9.5v4M12 17v.01" />
    </>
  ),
  sol: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
    </>
  ),
  luna: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />,
  monitor: (
    <>
      <rect x="3" y="4" width="18" height="12" rx="1.5" />
      <path d="M8 20h8M12 16v4" />
    </>
  ),
  facebook: <path d="M14 8.5h2.5V5.5H14c-2 0-3.5 1.5-3.5 3.5v2H8.5v3H10.5v9h3v-9h2.2l.6-3H13.5V9c0-.3.2-.5.5-.5Z" />,
  x: <path d="M4 4l16 16M20 4 4 20" />,
  instagram: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.2" cy="6.8" r="0.6" fill="currentColor" stroke="none" />
    </>
  ),
};

/**
 * ~14 glifos propios, inline (sin librería de íconos) — decorativos por
 * defecto (`aria-hidden`, no enfocables): el nombre accesible de un control
 * de solo-ícono va en el `aria-label` del botón/link que lo envuelve, no acá.
 */
export function Icono({
  nombre,
  direccion,
  className,
}: {
  nombre: NombreIcono;
  direccion?: "arriba" | "abajo" | "izquierda" | "derecha" | "arriba-derecha";
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("h-[1em] w-[1em] flex-none", className)}
      style={direccion ? { transform: `rotate(${ROTACION[direccion]}deg)` } : undefined}
    >
      {TRAZOS[nombre]}
    </svg>
  );
}
