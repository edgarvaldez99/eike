"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Boton } from "@/componentes/ui/Boton";
import { CampoTexto } from "@/componentes/ui/CampoTexto";

interface RespuestaValidacion {
  resultado: "ok" | "ya_usado" | "anulado" | "pendiente" | "invalido" | "error_red";
  mensaje: string;
  datos?: {
    nombreComprador: string;
    cedula: string | null;
    tandaNombre: string;
    asientoIdentificador: string | null;
  };
  error?: string;
}

const ESTILO_RESULTADO: Record<RespuestaValidacion["resultado"], { clase: string; titulo: string; vibracion: number[] }> = {
  ok: { clase: "border-green bg-green-dim", titulo: "✅ Acceso permitido", vibracion: [60] },
  ya_usado: { clase: "border-amber bg-amber-dim", titulo: "⚠️ Ya fue usado", vibracion: [60, 80, 60] },
  anulado: { clase: "border-red bg-red-dim", titulo: "⛔ Anulado", vibracion: [60, 80, 60] },
  pendiente: { clase: "border-amber bg-amber-dim", titulo: "⏳ Pago pendiente", vibracion: [60, 80, 60] },
  invalido: { clase: "border-red bg-red-dim", titulo: "❌ Inválido", vibracion: [60, 80, 60] },
  // Distinto de "invalido": acá el ticket puede ser perfectamente válido, solo
  // no se pudo consultar — no informarle a la puerta que el ticket está mal
  // cuando el problema real es la conexión.
  error_red: { clase: "border-amber bg-amber-dim", titulo: "📡 Sin conexión", vibracion: [60, 80, 60] },
};

// Cada cuánto se vuelve a intentar decodificar el frame de video. Sin este
// throttle, detector.detect() corre una vez por cada requestAnimationFrame
// (30-60 veces por segundo) toda la noche del evento — caro en batería/CPU
// para un celular de gama baja, y sin ningún beneficio: un QR no cambia
// entre un frame y el siguiente.
const INTERVALO_DETECCION_MS = 350;

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
    async (codigo: string, opciones?: { forzar?: boolean }) => {
      // El chequeo de `pausado` es para el detector automático de la cámara
      // (no reintentar mientras una validación ya está en vuelo); el código
      // manual lo puede saltar — es una acción explícita de la persona, no
      // debe quedar bloqueada por un scan previo sin resolver a mano.
      if ((pausadoRef.current && !opciones?.forzar) || !codigo.trim()) return;
      setPausado(true);
      setValidando(true);
      try {
        const res = await fetch("/api/escaner/validar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ codigo: codigo.trim(), evento_id: eventoId }),
        });
        const datos: RespuestaValidacion = await res.json();
        const final: RespuestaValidacion = res.ok
          ? datos
          : { resultado: "invalido", mensaje: datos.error ?? "Error de validación." };
        setResultado(final);
        if ("vibrate" in navigator) navigator.vibrate(ESTILO_RESULTADO[final.resultado].vibracion);
      } catch {
        const final: RespuestaValidacion = { resultado: "error_red", mensaje: "No se pudo conectar con el servidor." };
        setResultado(final);
        if ("vibrate" in navigator) navigator.vibrate(ESTILO_RESULTADO.error_red.vibracion);
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
    let ultimaDeteccion = 0;

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
      const ahora = performance.now();
      if (
        !pausadoRef.current &&
        videoRef.current &&
        videoRef.current.readyState >= 2 &&
        ahora - ultimaDeteccion >= INTERVALO_DETECCION_MS
      ) {
        ultimaDeteccion = ahora;
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

  function reiniciar() {
    setResultado(null);
    setCodigoManual("");
    setPausado(false);
  }

  const estilo = resultado ? ESTILO_RESULTADO[resultado.resultado] : null;

  return (
    <div className="flex flex-col gap-4 pb-24">
      {soportaCamara === null ? (
        <div
          role="status"
          aria-live="polite"
          className="flex aspect-square w-full items-center justify-center rounded-[var(--radius-eike)] border border-border bg-surface-2 p-4 text-center text-[13px] text-muted"
        >
          Solicitando acceso a la cámara…
        </div>
      ) : soportaCamara ? (
        <div className="relative aspect-square w-full overflow-hidden rounded-[var(--radius-eike)] border border-border bg-black">
          <video ref={videoRef} muted playsInline className="h-full w-full object-cover" />
        </div>
      ) : (
        <p className="eike-card p-4 text-center text-[13px] text-muted">
          Este navegador no tiene lectura de QR nativa — usá el código manual de abajo.
        </p>
      )}

      {resultado ? (
        <div role="status" aria-live="polite" className={`rounded-[var(--radius-eike)] border p-4 text-center ${estilo!.clase}`}>
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
        </div>
      ) : null}

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void validar(codigoManual, { forzar: true });
          setCodigoManual("");
        }}
      >
        <CampoTexto
          etiqueta="Código manual (si la cámara falla)"
          name="codigo_manual"
          value={codigoManual}
          onChange={(e) => setCodigoManual(e.target.value)}
          placeholder="EIK-XXXXXXXXXXXX"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          enterKeyHint="done"
          className="flex-1"
        />
        <Boton type="submit" disabled={validando} className="mt-6 h-fit">
          {validando ? "Validando…" : "Validar"}
        </Boton>
      </form>

      {resultado ? (
        <div className="eike-safe-bottom fixed inset-x-0 bottom-0 z-20 border-t border-border-soft bg-surface p-4">
          <div className="mx-auto max-w-md">
            <Boton className="w-full justify-center" onClick={reiniciar}>
              Escanear siguiente
            </Boton>
          </div>
        </div>
      ) : null}
    </div>
  );
}
