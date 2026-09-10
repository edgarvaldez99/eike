"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Cuenta regresiva del carrito (Fase 6 del plan de mejoras). El servidor ya
 * mandó `segundosIniciales` calculado con SU reloj (nunca confiar en el del
 * cliente — ver server/carrito.ts::obtenerResumenCarrito); acá solo se
 * descuenta visualmente. Al llegar a 0 refresca la página: el servidor es
 * quien decide de verdad si el carrito sigue vigente.
 *
 * El caller tiene que pasar `key={segundosIniciales}` — así, cada vez que
 * el servidor manda un valor nuevo (tras un router.refresh() real, tras
 * agregar/sacar un ítem), React remonta el componente en vez de arrastrar
 * el estado interno viejo. Evita reimplementar esa sincronización acá
 * adentro con un setState en un efecto (anti-patrón).
 */
export function ContadorCarrito({ segundosIniciales }: { segundosIniciales: number }) {
  const [segundos, setSegundos] = useState(segundosIniciales);
  const router = useRouter();

  useEffect(() => {
    if (segundos <= 0) {
      router.refresh();
      return;
    }
    const id = setTimeout(() => setSegundos((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [segundos, router]);

  const minutos = Math.floor(segundos / 60);
  const resto = segundos % 60;
  const urgente = segundos <= 60;

  return (
    <p className={urgente ? "text-[13px] font-semibold text-red" : "text-[13px] text-muted"}>
      Tu reserva vence en {minutos}:{resto.toString().padStart(2, "0")}
    </p>
  );
}
