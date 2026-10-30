// HU-06 · Detalle de un vehículo con su historial de servicios (ZARU-7).
import { useEffect, useState } from 'react';
import { api } from '../services/api.js';
import { TIPOS_VEHICULO } from '../lib/validacionVehiculo.js';
import { formatoFecha, formatoMoneda } from '../lib/formato.js';
import Modal from './Modal.jsx';

export default function DetalleVehiculo({ vehiculo, nombreCliente, onCerrar }) {
  const [historial, setHistorial] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/vehiculos/${vehiculo.id}/historial`).then(setHistorial).catch((e) => setError(e.message));
  }, [vehiculo.id]);

  return (
    <Modal titulo={`Vehículo ${vehiculo.placa}`} onCerrar={onCerrar}>
      <div className="modal-cuerpo">
        <dl className="detalle">
          <dt>Tipo</dt>
          <dd>{TIPOS_VEHICULO[vehiculo.tipo] ?? vehiculo.tipo}</dd>
          <dt>Marca</dt>
          <dd>{vehiculo.marca || '—'}</dd>
          <dt>Color</dt>
          <dd>{vehiculo.color || '—'}</dd>
          <dt>Cliente</dt>
          <dd>{nombreCliente}</dd>
        </dl>

        <section className="historial" aria-labelledby="historial-titulo">
          <h4 id="historial-titulo">Historial de servicios{historial ? ` (${historial.length})` : ''}</h4>
          {error && (
            <div className="aviso aviso-error" role="alert">
              <p>{error}</p>
            </div>
          )}
          {!historial && !error && <p className="texto-suave" role="status">Cargando historial…</p>}
          {historial?.length === 0 && <p className="texto-suave">Este vehículo aún no tiene servicios registrados.</p>}
          {historial?.length > 0 && (
            <ul className="lista-historial">
              {historial.map((orden) => (
                <li key={orden.ordenId}>
                  <div className="historial-encabezado">
                    <time dateTime={orden.fecha}>{formatoFecha(orden.fecha)}</time>
                    <strong>{formatoMoneda(orden.total)}</strong>
                  </div>
                  <ul className="historial-servicios">
                    {orden.servicios.map((servicio) => (
                      <li key={servicio.nombre}>
                        <span>{servicio.nombre}</span>
                        <span>{formatoMoneda(servicio.precio)}</span>
                      </li>
                    ))}
                    {orden.descuento > 0 && (
                      <li>
                        <span>Descuento</span>
                        <span>−{formatoMoneda(orden.descuento)}</span>
                      </li>
                    )}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <div className="modal-acciones">
        <button type="button" className="boton secundario" data-foco-inicial onClick={onCerrar}>
          Cerrar
        </button>
      </div>
    </Modal>
  );
}
