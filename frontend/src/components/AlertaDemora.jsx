// HU-11 — Notificación emergente no bloqueante para el administrador.
// Avisa que un vehículo lleva más de 30 segundos sin actualizar su estado y se
// repite cada 30 s desde el dashboard. No abre un <dialog>: es una ventanita
// flotante, así el admin puede seguir usando el tablero mientras la ve.
import { useEffect } from 'react';
import {
  ESTADOS_ORDEN,
  calcularDemora,
  tiempoEnEstadoLegible,
} from '../lib/dashboard.js';

const VISIBLE_MS = 8000;

export default function AlertaDemora({ ordenes, ahora, onCerrar }) {
  // Se oculta sola para comportarse como una notificación; el dashboard la
  // volverá a mostrar en el siguiente recordatorio de 30 s si sigue el retraso.
  useEffect(() => {
    const temporizador = setTimeout(onCerrar, VISIBLE_MS);
    return () => clearTimeout(temporizador);
  }, [onCerrar]);

  return (
    <div className="alerta-toast-contenedor" role="alert" aria-live="assertive">
      <div className="alerta-toast">
        <div className="alerta-toast-encabezado">
          <strong>
            <span aria-hidden="true">⚠ </span>
            {ordenes.length === 1 ? 'Vehículo sin actualizar' : 'Vehículos sin actualizar'}
          </strong>
          <button
            type="button"
            className="alerta-toast-cerrar"
            onClick={onCerrar}
            aria-label="Cerrar alerta"
          >
            ×
          </button>
        </div>

        <p className="alerta-toast-texto">
          {ordenes.length === 1 ? 'Este vehículo lleva' : 'Estos vehículos llevan'} más de 30
          segundos en el mismo estado.
        </p>

        <ul className="alerta-toast-lista">
          {ordenes.map((orden) => {
            const demora = calcularDemora(orden, ahora);
            return (
              <li key={orden.id}>
                <span className="placa">{orden.vehiculos?.placa ?? 'Sin placa'}</span>
                <span className="alerta-toast-estado">
                  {ESTADOS_ORDEN[orden.estado] ?? orden.estado}
                </span>
                <span className="alerta-toast-tiempo">
                  {tiempoEnEstadoLegible(demora.transcurridoSeg)}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
