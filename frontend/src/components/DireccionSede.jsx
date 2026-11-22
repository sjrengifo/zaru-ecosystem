// HU-28 CA2 (ZARU-17) — Dirección de la sede. Va en el aviso de "listo para recoger" (correo y SMS)
// para que el cliente sepa a dónde ir. Solo el administrador la cambia.
import { useId, useState } from 'react';
import { MapPin } from 'lucide-react';
import { api } from '../services/api.js';
import MensajeError from './MensajeError.jsx';

export const MAX_DIRECCION = 160;

export default function DireccionSede({ establecimiento, setEstablecimiento, puedeEditar, alGuardar }) {
  const id = useId();
  const guardada = establecimiento.direccion ?? '';
  const [direccion, setDireccion] = useState(guardada);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const limpia = direccion.trim().replace(/\s+/g, ' ');
  const cambiada = limpia !== guardada;

  async function guardar(evento) {
    evento.preventDefault();
    if (!cambiada || enviando) return;
    if (limpia.length > MAX_DIRECCION) {
      setError(`La dirección puede tener hasta ${MAX_DIRECCION} caracteres.`);
      return;
    }
    setEnviando(true);
    setError('');
    try {
      const actualizado = await api.put('/establecimiento/direccion', { direccion: limpia });
      setEstablecimiento(actualizado);
      setDireccion(actualizado.direccion ?? '');
      alGuardar?.(actualizado.direccion
        ? 'Tus clientes verán esta dirección cuando su vehículo esté listo.'
        : 'Los avisos de "listo" saldrán sin dirección.');
    } catch (err) {
      setError(err.detalles?.find((d) => d.campo === 'direccion')?.mensaje ?? err.message ?? 'No pudimos guardar la dirección.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="tarjeta direccion-sede" aria-labelledby={`${id}-titulo`}>
      <h3 id={`${id}-titulo`}>Dirección de la sede</h3>
      <p className="texto-suave">
        Va en el aviso de &quot;vehículo listo para recoger&quot; para que tus clientes sepan a dónde ir.
      </p>
      <form onSubmit={guardar} noValidate>
        <div className="campo">
          <label htmlFor={`${id}-direccion`}>Dirección</label>
          <div className="campo-control campo-con-icono">
            <MapPin size={18} aria-hidden="true" />
            <input
              id={`${id}-direccion`}
              value={direccion}
              onChange={(e) => { setDireccion(e.target.value); setError(''); }}
              maxLength={MAX_DIRECCION + 20}
              placeholder="Cra 10 # 5-20, barrio Centro"
              autoComplete="street-address"
              disabled={!puedeEditar || enviando}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? `${id}-error` : `${id}-ayuda`}
            />
          </div>
          {error
            ? <MensajeError id={`${id}-error`}>{error}</MensajeError>
            : <p id={`${id}-ayuda`} className="campo-ayuda">Opcional. Déjala vacía si no quieres mostrarla.</p>}
        </div>
        {puedeEditar && (
          <div className="direccion-sede-acciones">
            <button className="boton" disabled={!cambiada} aria-busy={enviando}>
              {enviando ? 'Guardando…' : 'Guardar dirección'}
            </button>
          </div>
        )}
      </form>
    </section>
  );
}
