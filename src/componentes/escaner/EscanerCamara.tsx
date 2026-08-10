"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Boton } from "@/componentes/ui/Boton";
import { CampoTexto } from "@/componentes/ui/CampoTexto";

interface RespuestaValidacion {
  resultado: "ok" | "ya_usado" | "anulado" | "pendiente" | "invalido";
  mensaje: string;
  datos?: {
    nombreComprador: string;
    cedula: string | null;
    tandaNombre: string;
    asientoIdentificador: string | null;
  };
  error?: string;
}

const ESTILO_RESULTADO: Record<RespuestaValidacion["resultado"], { clase: string; titulo: string }> = {
  ok: { clase: "border-green bg-green-dim", titulo: "✅ Acceso permitido" },
  ya_usado: { clase: "border-amber bg-amber-dim", titulo: "⚠️ Ya fue usado" },
  anulado: { clase: "border-red bg-red-dim", titulo: "⛔ Anulado" },
  pendiente: { clase: "border-amber bg-amber-dim", titulo: "⏳ Pago pendiente" },
  invalido: { clase: "border-red bg-red-dim", titulo: "❌ Inválido" },
};

// BarcodeDetector es una API del navegador (Chrome/Android) sin tipos en TS por defecto.
interface DetectorDeCodigos {
  detect(fuente: HTMLVideoElement): Promise<{ rawValue: string }[]>;
}
declare global {
  interface Window {
    BarcodeDetector?: new (opciones: { formats: string[] }) => DetectorDeCodigos;
  }
}

export function EscanerCamara({ eventoId }: { eventoId: number }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [soportaCamara, setSoportaCamara] = useState<boolean | null>(null);
  const [pausado, setPausado] = useState(false);
  const [resultado, setResultado] = useState<RespuestaValidacion | null>(null);
  const [codigoManual, setCodigoManual] = useState("");
  const [validando, setValidando] = useState(false);

  // pausadoRef existe solo para que el bucle de la cámara (que corre fuera
  // del ciclo de render, en un requestAnimationFrame) lea el valor más
  // fresco sin tener que reconstruir el bucle en cada cambio de estado.
  // Nunca se muta durante el render — react-hooks/refs lo prohíbe — solo
  // acá, en un effect disparado por el cambio real de `pausado`.
  const pausadoRef = useRef(pausado);
  useEffect(() => {
    pausadoRef.current = pausado;
  }, [pausado]);

  const validar = useCallback(
    async (codigo: string) => {
      if (pausadoRef.current || !codigo.trim()) return;
      setPausado(true);
      setValidando(true);
      try {
        const res = await fetch("/api/escaner/validar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ codigo: codigo.trim(), evento_id: eventoId }),
        });
        const datos: RespuestaValidacion = await res.json();
        setResultado(res.ok ? datos : { resultado: "invalido", mensaje: datos.error ?? "Error de validación." });
      } catch {
        setResultado({ resultado: "invalido", mensaje: "No se pudo conectar con el servidor." });
      } finally {
        setValidando(false);
      }
    },
    [eventoId],
  );

  // Cámara: BarcodeDetector nativo (Chrome/Android — el caso real de uso en la
  // puerta). Sin fallback a una librería WASM por ahora: si el navegador no
  // lo soporta (ej. Safari/iOS), queda la entrada manual, que siempre funciona.
  useEffect(() => {
    let activo = true;
    let stream: MediaStream | null = null;
    let frame: number;

    async function iniciar() {
      if (!window.BarcodeDetector) {
        setSoportaCamara(false);
        return;
      }
      const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (!activo || !videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setSoportaCamara(true);
        void bucle(detector);
      } catch {
        setSoportaCamara(false);
      }
    }

    async function bucle(detector: DetectorDeCodigos) {
      if (!activo) return;
      if (!pausadoRef.current && videoRef.current && videoRef.current.readyState >= 2) {
        try {
          const codigos = await detector.detect(videoRef.current);
          if (codigos[0]) {
            void validar(codigos[0].rawValue);
          }
        } catch {
          // frame sin decodificar, seguir intentando
        }
      }
      frame = requestAnimationFrame(() => void bucle(detector));
    }

    void iniciar();
    return () => {
      activo = false;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [validar]);

  const estilo = resultado ? ESTILO_RESULTADO[resultado.resultado] : null;

  return (
    <div className="flex flex-col gap-4">
      {soportaCamara ? (
        <div className="relative aspect-square w-full overflow-hidden rounded-[var(--radius-eike)] border border-border bg-black">
          <video ref={videoRef} muted playsInline className="h-full w-full object-cover" />
        </div>
      ) : soportaCamara === false ? (
        <p className="eike-card p-4 text-center text-[13px] text-muted">
          Este navegador no tiene lectura de QR nativa — usá el código manual de abajo.
        </p>
      ) : null}

      {resultado ? (
        <div className={`rounded-[var(--radius-eike)] border p-4 text-center ${estilo!.clase}`}>
          <div className="text-lg font-extrabold">{estilo!.titulo}</div>
          <p className="mt-1 text-[13px]">{resultado.mensaje}</p>
          {resultado.datos ? (
            <div className="mt-3 text-left text-[13px]">
              <div>
                <strong>{resultado.datos.nombreComprador}</strong>
                {resultado.datos.cedula ? ` · CI: ${resultado.datos.cedula}` : ""}
              </div>
              <div className="text-muted">
                {resultado.datos.tandaNombre}
                {resultado.datos.asientoIdentificador ? ` · ${resultado.datos.asientoIdentificador}` : ""}
              </div>
            </div>
          ) : null}
          <Boton
            className="mt-3 w-full justify-center"
            onClick={() => {
              setResultado(null);
              setCodigoManual("");
              setPausado(false);
            }}
          >
            Escanear siguiente
          </Boton>
        </div>
      ) : (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void validar(codigoManual);
          }}
        >
          <CampoTexto
            etiqueta="Código manual (si la cámara falla)"
            value={codigoManual}
            onChange={(e) => setCodigoManual(e.target.value)}
            placeholder="EIK-XXXXXXXXXXXX"
            className="flex-1"
          />
          <Boton type="submit" disabled={validando} className="mt-6 h-fit">
            {validando ? "…" : "Validar"}
          </Boton>
        </form>
      )}
    </div>
  );
}
