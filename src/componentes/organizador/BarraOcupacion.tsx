import { Card } from "@/componentes/ui/Card";

interface Segmento {
  etiqueta: string;
  valor: number;
  color: string; // clase tailwind de background, ej. "bg-cyan"
  colorTexto: string; // clase tailwind de texto, ej. "text-cyan"
}

export function BarraOcupacion({
  disponibles,
  pendientes,
  cortesias,
  usados,
  capacidadTotal,
}: {
  disponibles: number;
  pendientes: number;
  cortesias: number;
  usados: number;
  capacidadTotal: number;
}) {
  const ocupado = disponibles + pendientes + cortesias + usados;
  const sobrantes = Math.max(0, capacidadTotal - ocupado);
  const total = Math.max(1, capacidadTotal); // evita división por 0 si no hay tandas

  const segmentos: Segmento[] = [
    { etiqueta: "Disponibles", valor: disponibles, color: "bg-cyan", colorTexto: "text-cyan" },
    { etiqueta: "Pendientes de pago", valor: pendientes, color: "bg-amber", colorTexto: "text-amber" },
    { etiqueta: "Cortesías", valor: cortesias, color: "bg-green", colorTexto: "text-green" },
    { etiqueta: "Validados en puerta", valor: usados, color: "bg-orange", colorTexto: "text-orange" },
    { etiqueta: "Sobrantes / sin vender", valor: sobrantes, color: "bg-border", colorTexto: "text-muted" },
  ];

  return (
    <Card>
      <div className="mb-3.5 text-[13.5px] font-bold">Ocupación por estado</div>
      <div className="mb-4 flex h-2.5 overflow-hidden rounded-full bg-surface-2">
        {segmentos.map((s) =>
          s.valor > 0 ? (
            <div key={s.etiqueta} className={s.color} style={{ width: `${(s.valor / total) * 100}%` }} />
          ) : null,
        )}
      </div>
      <div className="flex flex-col gap-2.5">
        {segmentos.map((s) => (
          <div key={s.etiqueta} className="flex items-center gap-2.5 text-[12.5px]">
            <span className={`h-2.5 w-2.5 flex-none rounded-sm ${s.color}`} />
            <span className="flex-1 text-muted">{s.etiqueta}</span>
            <span className="num font-bold">{s.valor}</span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11.5px] text-muted-dim">
        Eike vende 100% online — no se separa boxoffice/presencial.
      </p>
    </Card>
  );
}
