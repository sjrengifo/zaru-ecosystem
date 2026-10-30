// HU-03 CA3 y HU-04 · Detalle de un cliente, con la opción de editarlo.
import { useEffect, useState } from 'react';
import { api } from '../services/api.js';

export default function DetalleCliente({ id, onEditar, onCerrar }) {
  const [cliente, setCliente] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/clientes/${id}`).then(setCliente).catch((e) => setError(e.message));
  }, [id]);

  return (
    <>
      <div className="modal-cuerpo">
        {error && (
          <div className="aviso aviso-error" role="alert">
            <p>{error}</p>
          </div>
        )}
        {!cliente && !error && <p className="texto-suave" role="status">Cargando…</p>}
        {cliente && (
          <dl className="detalle">
            <dt>Nombre</dt>
            <dd>{cliente.nombre}</dd>
            <dt>Celular</dt>
            <dd>{cliente.telefono}</dd>
            <dt>Correo</dt>
            <dd>{cliente.correo || '—'}</dd>
            <dt>Autorización de datos</dt>
            <dd>{new Date(cliente.fecha_autorizacion).toLocaleString('es-CO')}</dd>
            <dt>Vehículos</dt>
            <dd>{cliente.vehiculos?.map((v) => v.placa).join(', ') || '—'}</dd>
          </dl>
        )}
      </div>
      <div className="modal-acciones">
        <button type="button" className="boton secundario" data-foco-inicial onClick={onCerrar}>
          Cerrar
        </button>
        <button type="button" className="boton" disabled={!cliente} onClick={() => onEditar(cliente)}>
          Editar
        </button>
      </div>
    </>
  );
}
