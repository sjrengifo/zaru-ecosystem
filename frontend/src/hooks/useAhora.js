// HU-11 — Reloj del tablero.
// El tiempo en un estado avanza aunque no llegue ningún evento de Realtime, así
// que el dashboard necesita una referencia que se renueve sola para detectar
// los 30 s de retraso y mostrar el tiempo transcurrido con precisión.
import { useEffect, useState } from 'react';

const INTERVALO_MS = 1000;

export function useAhora(intervaloMs = INTERVALO_MS) {
  const [ahora, setAhora] = useState(() => new Date());

  useEffect(() => {
    const temporizador = setInterval(() => setAhora(new Date()), intervaloMs);
    return () => clearInterval(temporizador);
  }, [intervaloMs]);

  return ahora;
}
