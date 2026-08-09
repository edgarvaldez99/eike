import { cn } from "@/lib/cn";

export function Metrica({
  etiqueta,
  valor,
  sub,
  acento = false,
}: {
  etiqueta: React.ReactNode;
  valor: React.ReactNode;
  sub?: React.ReactNode;
  acento?: boolean;
}) {
  return (
    <div className="eike-card flex flex-col gap-1.5 p-4">
      <span className="eike-eyebrow flex items-center gap-1.5">{etiqueta}</span>
      <span className={cn("num text-2xl font-extrabold tracking-tight", acento && "text-cyan")}>
        {valor}
      </span>
      {sub ? <span className="text-[11.5px] text-muted-dim">{sub}</span> : null}
    </div>
  );
}
