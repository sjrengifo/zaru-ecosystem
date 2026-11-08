// HU-18 — Código de seguimiento en la tarjeta del tablero, con el enlace para el cliente.
// El operario lo copia y lo comparte (por ejemplo, por WhatsApp) para que el cliente vea el
// estado del lavado desde su celular. El correo de ingreso ya lo incluye cuando hay correo.
import { useEffect, useRef, useState } from 'react';
import { Check, Copy, ExternalLink } from 'lucide-react';
import { enlaceSeguimiento } from '../lib/seguimiento.js';

export default function EnlaceSeguimiento({ codigo, placa }) {
  const [copiado, setCopiado] = useState(false);
  const temporizador = useRef(null);
  const enlace = enlaceSeguimiento(codigo);

  useEffect(() => () => clearTimeout(temporizador.current), []);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(enlace);
      setCopiado(true);
      clearTimeout(temporizador.current);
      temporizador.current = setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Sin permiso para el portapapeles: se abre el enlace para copiarlo desde la barra.
      window.open(enlace, '_blank', 'noopener');
    }
  };

  return (
    <span className="enlace-seguimiento">
      <span className="enlace-seguimiento-codigo">{codigo}</span>
      <button
        type="button"
        className="enlace-seguimiento-boton"
        onClick={copiar}
        aria-label={copiado ? 'Enlace copiado' : `Copiar el enlace de seguimiento del vehículo ${placa}`}
        title={copiado ? 'Enlace copiado' : 'Copiar enlace para el cliente'}
      >
        {copiado ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
      </button>
      <a
        className="enlace-seguimiento-boton"
        href={enlace}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Abrir el seguimiento del vehículo ${placa}`}
        title="Ver lo que ve el cliente"
      >
        <ExternalLink size={14} aria-hidden="true" />
      </a>
      <span className="solo-lectores" role="status" aria-live="polite">
        {copiado ? 'Enlace de seguimiento copiado' : ''}
      </span>
    </span>
  );
}
