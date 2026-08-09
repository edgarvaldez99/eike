import { cn } from "@/lib/cn";

const VARIANTES = {
  ok: "eike-pill--ok",
  warn: "eike-pill--warn",
  err: "eike-pill--err",
  info: "eike-pill--info",
  neutral: "eike-pill--neutral",
} as const;

export function Pill({
  variante = "neutral",
  className,
  children,
}: {
  variante?: keyof typeof VARIANTES;
  className?: string;
  children: React.ReactNode;
}) {
  return <span className={cn("eike-pill", VARIANTES[variante], className)}>{children}</span>;
}
