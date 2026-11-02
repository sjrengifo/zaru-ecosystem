// HU-06 · Detalle de un vehículo con su historial de servicios (ZARU-7).
import { useEffect, useState } from 'react';
import { api } from '../services/api.js';
import { TIPOS_VEHICULO } from '../lib/validacionVehiculo.js';
import { formatoFecha, formatoMoneda } from '../lib/formato.js';
import Modal from './Modal.jsx';
import Icono from './Icono.jsx';

export default function DetalleVehiculo({ vehiculo, nombreCliente, onCerrar }) {
  const [historial, setHistorial] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/vehiculos/${vehiculo.id}/historial`).then(setHistorial).catch((e) => setError(e.message));
  }, [vehiculo.id]);

  const icono = vehiculo.tipo === 'moto' ? 'moto' : 'carro';
  const caracteristicas = [TIPOS_VEHICULO[vehiculo.tipo] ?? vehiculo.tipo, vehiculo.marca, vehiculo.color].filter(Boolean).join(' · ');
  const totalServicios = historial?.reduce((suma, orden) => suma + Number(orden.total), 0);

  return (
    <Modal titulo="Detalle del vehículo" onCerrar={onCerrar}>
      <div className="modal-cuerpo perfil">
        <header className="perfil-cabecera">
          <span className="perfil-avatar" aria-hidden="true">
            <Icono nombre={icono} tamano={28} />
          </span>
          <div className="perfil-identidad">
            <span className="placa placa-grande">{vehiculo.placa}</span>
            <p className="perfil-caracteristicas">{caracteristicas}</p>
            <p className="perfil-sello">
              <Icono nombre="persona" tamano={14} />
              {nombreCliente}
            </p>
          </div>
        </header>

        {error && (
          <div className="aviso aviso-error" role="alert">
            <p>{error}</p>
          </div>
        )}
        {!historial && !error && (
          <div className="perfil-cargando" role="status" aria-label="Cargando el historial del vehículo">
            <span />
          </div>
        )}

        {historial?.length > 0 && (
          <dl className="resumen-vehiculo">
            <div>
              <dt>Servicios</dt>
              <dd>{historial.length}</dd>
            </div>
            <div>
              <dt>Total</dt>
              <dd>{formatoMoneda(totalServicios)}</dd>
            </div>
            <div>
              <dt>Último servicio</dt>
              <dd>{formatoFecha(historial[0].fecha)}</dd>
            </div>
          </dl>
        )}

        {historial && (
          <section className="perfil-tarjeta" aria-labelledby="historial-titulo">
            <div className="perfil-encabezado">
              <h4 id="historial-titulo">
                Historial de servicios <span className="perfil-contador">{historial.length}</span>
              </h4>
            </div>
            {historial.length === 0 ? (
              <div className="perfil-vacio">
                <span className="perfil-dato-icono">
                  <Icono nombre="calendario" />
                </span>
                <p>Este vehículo aún no tiene servicios registrados.</p>
              </div>
            ) : (
              <ul className="lista-historial">
                {historial.map((orden) => (
                  <li key={orden.ordenId}>
                    <div className="historial-encabezado">
                      <time dateTime={orden.fecha}>
                        <Icono nombre="calendario" tamano={14} />
                        {formatoFecha(orden.fecha)}
                      </time>
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
                        <li className="historial-descuento">
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
        )}
      </div>
    </Modal>
  );
}
