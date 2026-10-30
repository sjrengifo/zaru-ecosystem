// HU-52 CA2 · Confirmación antes de eliminar un cliente: muestra a quién se elimina, qué se borra y que no se puede deshacer.
import { useState } from 'react';
import { api } from '../services/api.js';
import { iniciales } from '../lib/formato.js';
import Modal from './Modal.jsx';

export default function ConfirmarEliminarCliente({ cliente, onEliminado, onCancelar }) {
  const [eliminando, setEliminando] = useState(false);
  const [error, setError] = useState('');
  const vehiculos = cliente.vehiculos ?? [];

  async function eliminar() {
    setError('');
    setEliminando(true);
    try {
      await api.delete(`/clientes/${cliente.id}`);
      onEliminado(cliente);
    } catch (e) {
      setError(e.message);
      setEliminando(false);
    }
  }

  return (
    <Modal titulo="¿Eliminar este cliente?" onCerrar={() => !eliminando && onCancelar()}>
      <div className="modal-cuerpo">
        <div className="eliminar-cliente">
          <span className="eliminar-avatar" aria-hidden="true">
            {iniciales(cliente.nombre)}
          </span>
          <div>
            <p className="eliminar-nombre">{cliente.nombre}</p>
            <p className="texto-suave">{cliente.telefono}</p>
          </div>
        </div>

        <dl className="eliminar-impacto">
          <div>
            <dt>Se borra</dt>
            <dd>Sus datos personales, autorizaciones y notificaciones.</dd>
          </div>
          <div>
            <dt>Vehículos</dt>
            <dd>
              {vehiculos.length > 0 ? (
                <span className="eliminar-placas">
                  {vehiculos.map((v) => (
                    <span key={v.placa} className="placa">
                      {v.placa}
                    </span>
                  ))}
                </span>
              ) : (
                'No tiene vehículos registrados.'
              )}
            </dd>
          </div>
          <div>
            <dt>Se conserva</dt>
            <dd>Los servicios entregados, sin datos del cliente, para las estadísticas.</dd>
          </div>
        </dl>

        <p className="eliminar-advertencia">Esta acción no se puede deshacer.</p>

        {error && (
          <div className="aviso aviso-error" role="alert">
            <p>{error}</p>
          </div>
        )}
      </div>
      <div className="modal-acciones">
        {/* El foco inicia en la opción segura. */}
        <button type="button" className="boton secundario" data-foco-inicial disabled={eliminando} onClick={onCancelar}>
          Cancelar
        </button>
        <button type="button" className="boton peligro" disabled={eliminando} onClick={eliminar}>
          {eliminando ? 'Eliminando…' : 'Eliminar definitivamente'}
        </button>
      </div>
    </Modal>
  );
}
