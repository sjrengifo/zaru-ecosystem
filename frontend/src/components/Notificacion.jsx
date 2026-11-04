// Notificación breve en la esquina inferior derecha. Se cierra sola, salvo mientras el cursor
// o el foco están sobre ella, para que siempre se alcance a leer (WCAG 2.2.1).
// tipo: "exito" (por defecto) o "advertencia" (p. ej. HU-46: el cliente no tiene correo).
import { useEffect, useState } from 'react';

const DURACION_MS = 6000;

export default function Notificacion({ titulo, detalle, onCerrar, tipo = 'exito' }) {
  const [pausada, setPausada] = useState(false);

  useEffect(() => {
    if (pausada) return;
    const espera = setTimeout(onCerrar, DURACION_MS);
    return () => clearTimeout(espera);
  }, [pausada, onCerrar]);

  return (
    <div
      className={`notificacion${tipo === 'advertencia' ? ' notificacion-advertencia' : ''}`}
      onMouseEnter={() => setPausada(true)}
      onMouseLeave={() => setPausada(false)}
      onFocus={() => setPausada(true)}
      onBlur={() => setPausada(false)}
    >
      <span className="notificacion-icono" aria-hidden="true">{tipo === 'advertencia' ? '!' : '✓'}</span>
      <div className="notificacion-texto">
        <p className="notificacion-titulo">{titulo}</p>
        {detalle && <p>{detalle}</p>}
      </div>
      <button type="button" className="notificacion-cerrar" aria-label="Cerrar notificación" onClick={onCerrar}>
        ×
      </button>
    </div>
  );
}
