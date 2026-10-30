// HU-03 CA3, HU-04 y HU-05 · Perfil de un cliente: sus datos, sus vehículos y las opciones de editarlo y agregar vehículos.
import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api.js';
import { TIPOS_VEHICULO } from '../lib/validacionVehiculo.js';
import FormularioVehiculo from './FormularioVehiculo.jsx';
import Notificacion from './Notificacion.jsx';

export default function DetalleCliente({ id, onEditar, onCerrar, onAbrirCliente, onVehiculoRegistrado }) {
  const [cliente, setCliente] = useState(null);
  const [error, setError] = useState('');
  const [recargas, setRecargas] = useState(0);
  const [agregando, setAgregando] = useState(false);
  const [confirmacion, setConfirmacion] = useState(null);
  const cerrarConfirmacion = useCallback(() => setConfirmacion(null), []);

  useEffect(() => {
    api.get(`/clientes/${id}`).then(setCliente).catch((e) => setError(e.message));
  }, [id, recargas]);

  function alRegistrar(vehiculo) {
    setAgregando(false);
    setRecargas((n) => n + 1); // CA3: el perfil muestra el vehículo nuevo junto a los demás.
    setConfirmacion({ id: Date.now(), titulo: 'Vehículo registrado', detalle: `${vehiculo.placa} · ${cliente.nombre}` });
    onVehiculoRegistrado?.();
  }

  const vehiculos = [...(cliente?.vehiculos ?? [])].sort((a, b) => a.placa.localeCompare(b.placa));

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
          <>
            <dl className="detalle">
              <dt>Nombre</dt>
              <dd>{cliente.nombre}</dd>
              <dt>Celular</dt>
              <dd>{cliente.telefono}</dd>
              <dt>Correo</dt>
              <dd>{cliente.correo || '—'}</dd>
              <dt>Autorización de datos</dt>
              <dd>{new Date(cliente.fecha_autorizacion).toLocaleString('es-CO')}</dd>
            </dl>

            <section className="perfil-vehiculos" aria-labelledby="perfil-vehiculos-titulo">
              <div className="perfil-vehiculos-encabezado">
                <h4 id="perfil-vehiculos-titulo">Vehículos ({vehiculos.length})</h4>
                <button type="button" className="boton secundario" onClick={() => setAgregando(true)}>
                  + Agregar vehículo
                </button>
              </div>
              {vehiculos.length === 0 ? (
                <p className="texto-suave">Este cliente aún no tiene vehículos registrados.</p>
              ) : (
                <ul className="lista-vehiculos">
                  {vehiculos.map((v) => (
                    <li key={v.id}>
                      <span className="placa">{v.placa}</span>
                      <span className="texto-suave">{[TIPOS_VEHICULO[v.tipo] ?? v.tipo, v.marca, v.color].filter(Boolean).join(' · ')}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
      <div className="modal-acciones">
        <button type="button" className="boton secundario" data-foco-inicial onClick={onCerrar}>
          Cerrar
        </button>
        {onEditar && (
          <button type="button" className="boton" disabled={!cliente} onClick={() => onEditar(cliente)}>
            Editar
          </button>
        )}
      </div>

      {agregando && (
        <FormularioVehiculo
          cliente={cliente}
          onRegistrado={alRegistrar}
          onAbrirCliente={(otro) => {
            setAgregando(false);
            onAbrirCliente(otro);
          }}
          onCancelar={() => setAgregando(false)}
        />
      )}

      {/* Dentro del modal, para que el fondo oscuro no la tape. */}
      <div className="notificaciones" role="status">
        {confirmacion && <Notificacion key={confirmacion.id} titulo={confirmacion.titulo} detalle={confirmacion.detalle} onCerrar={cerrarConfirmacion} />}
      </div>
    </>
  );
}
