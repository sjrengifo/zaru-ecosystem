// HU-37 CA1/CA2 — Mensaje del operario con evidencia opcional de daño.
import { useState } from 'react';
import { api } from '../services/api.js';
import Modal from './Modal.jsx';

const TIPOS = [
  { id: 'demora', titulo: 'Demora estimada', texto: 'Tu vehículo presenta una demora en el lavado.' },
  { id: 'dano_preexistente', titulo: 'Daño preexistente', texto: 'Identificamos un daño preexistente en tu vehículo.' },
  { id: 'objeto_encontrado', titulo: 'Objeto encontrado', texto: 'Encontramos un objeto en tu vehículo.' },
];
const TIPO_OTRO = { id: 'otro', titulo: 'Otro mensaje', texto: '' };
const MAX_FOTOS = 3;
const MAX_BYTES = 5 * 1024 * 1024;

export default function FormularioNovedad({ orden, onCerrar, onGuardado }) {
  const [tipo, setTipo] = useState('demora');
  const [mensaje, setMensaje] = useState(TIPOS[0].texto);
  const [minutosExtra, setMinutosExtra] = useState('15');
  const [fotos, setFotos] = useState([]);
  const [novedadPendiente, setNovedadPendiente] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const elegirTipo = (opcion) => {
    setTipo(opcion.id);
    setMensaje(opcion.texto);
    setFotos([]);
    setError('');
  };

  function seleccionarFotos(evento) {
    const seleccion = Array.from(evento.target.files ?? []);
    evento.target.value = '';
    if (seleccion.length > MAX_FOTOS) {
      setError('Puedes adjuntar hasta 3 fotos.');
      return;
    }
    if (seleccion.some((archivo) => !['image/jpeg', 'image/png'].includes(archivo.type) || archivo.size > MAX_BYTES)) {
      setError('Cada foto debe ser JPG o PNG y pesar máximo 5 MB.');
      return;
    }
    setError('');
    setFotos(seleccion);
  }

  async function enviar(evento) {
    evento.preventDefault();
    setError('');
    setGuardando(true);
    try {
      let novedad = novedadPendiente;
      if (!novedad) {
        novedad = await api.post(`/ordenes/${orden.id}/novedades`, {
          tipo,
          mensaje: mensaje.trim() || null,
          ...(tipo === 'demora' ? { minutosExtra: Number(minutosExtra) } : {}),
        });
        setNovedadPendiente(novedad);
      }
      if (fotos.length) {
        const datos = new FormData();
        fotos.forEach((foto) => datos.append('fotos', foto));
        await api.subir(`/ordenes/${orden.id}/novedades/${novedad.id}/fotos`, datos);
      }
      onGuardado(novedad);
    } catch (fallo) {
      setError(fallo.message || 'No pudimos guardar la novedad. Intenta de nuevo.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Modal titulo={`Notificar novedad · ${orden.vehiculos?.placa ?? 'Vehículo'}`} onCerrar={onCerrar}>
      <form className="formulario-novedad modal-cuerpo" onSubmit={enviar}>
        <p className="texto-suave">Elige un mensaje predefinido o edítalo antes de enviarlo.</p>
        <div className="novedad-opciones" role="group" aria-label="Mensajes predefinidos">
          {[...TIPOS, TIPO_OTRO].map((opcion) => (
            <button
              key={opcion.id}
              type="button"
              className={`boton secundario novedad-opcion${tipo === opcion.id ? ' seleccionada' : ''}`}
              aria-pressed={tipo === opcion.id}
              onClick={() => elegirTipo(opcion)}
            >
              {opcion.titulo}
            </button>
          ))}
        </div>

        <label className="campo-novedad" htmlFor="novedad-mensaje">
          Mensaje para el cliente
          <textarea
            id="novedad-mensaje"
            aria-label="Mensaje para el cliente"
            value={mensaje}
            onChange={(evento) => setMensaje(evento.target.value.slice(0, 300))}
            maxLength={300}
            rows={4}
            placeholder="Escribe un mensaje breve"
            data-foco-inicial
          />
          <span className="novedad-contador">{mensaje.length}/300 caracteres</span>
        </label>

        {tipo === 'demora' && (
          <label className="campo-novedad" htmlFor="novedad-minutos">
            Minutos adicionales estimados
            <input
              id="novedad-minutos"
              type="number"
              min="1"
              max="1440"
              step="1"
              required
              value={minutosExtra}
              onChange={(evento) => setMinutosExtra(evento.target.value)}
            />
          </label>
        )}

        {tipo === 'dano_preexistente' && (
          <label className="campo-novedad" htmlFor="novedad-fotos">
            Fotos de evidencia (hasta 3, JPG o PNG, máximo 5 MB cada una)
            <input id="novedad-fotos" aria-label="Fotos de evidencia" type="file" accept="image/jpeg,image/png" multiple onChange={seleccionarFotos} />
            {fotos.length > 0 && <span className="novedad-contador">{fotos.length} foto{fotos.length === 1 ? '' : 's'} seleccionada{fotos.length === 1 ? '' : 's'}</span>}
          </label>
        )}

        {error && <p className="aviso aviso-error" role="alert">{error}</p>}
        {novedadPendiente && error && <p className="texto-suave">El mensaje quedó guardado. Puedes volver a intentar adjuntar las fotos.</p>}
        <div className="novedad-acciones">
          <button type="button" className="boton secundario" onClick={onCerrar} disabled={guardando}>Cancelar</button>
          <button type="submit" className="boton" disabled={guardando || (tipo === 'dano_preexistente' && fotos.length > MAX_FOTOS)}>
            {guardando ? 'Enviando…' : 'Enviar novedad'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
