// HU-03 CA3, HU-04, HU-05, HU-06 y HU-52 · Perfil de un cliente: sus datos, sus vehículos con su historial y las opciones de editarlo, agregar vehículos y eliminarlo.
import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api.js';
import { TIPOS_VEHICULO } from '../lib/validacionVehiculo.js';
import { formatoFecha, iniciales } from '../lib/formato.js';
import { useRol } from '../hooks/useRol.js';
import ConfirmarEliminarCliente from './ConfirmarEliminarCliente.jsx';
import FormularioVehiculo from './FormularioVehiculo.jsx';
import DetalleVehiculo from './DetalleVehiculo.jsx';
import Notificacion from './Notificacion.jsx';
import Icono from './Icono.jsx';

export default function DetalleCliente({ id, onEditar, onAbrirCliente, onVehiculoRegistrado, onEliminado }) {
  const rol = useRol();
  const [confirmandoEliminar, setConfirmandoEliminar] = useState(false);
  const [cliente, setCliente] = useState(null);
  const [error, setError] = useState('');
  const [recargas, setRecargas] = useState(0);
  const [agregando, setAgregando] = useState(false);
  const [vehiculoAbierto, setVehiculoAbierto] = useState(null);
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
      <div className="modal-cuerpo perfil">
        {error && (
          <div className="aviso aviso-error" role="alert">
            <p>{error}</p>
          </div>
        )}
        {!cliente && !error && (
          <div className="perfil-cargando" role="status" aria-label="Cargando el perfil del cliente">
            <span />
            <span />
          </div>
        )}
        {cliente && (
          <>
            <header className="perfil-cabecera">
              <span className="perfil-avatar" aria-hidden="true">
                {iniciales(cliente.nombre)}
              </span>
              <div className="perfil-identidad">
                <p className="perfil-nombre">{cliente.nombre}</p>
                <p className="perfil-sello">
                  <Icono nombre="escudo" tamano={14} />
                  Autorizó sus datos el {formatoFecha(cliente.fecha_autorizacion)}
                </p>
              </div>
            </header>

            <section className="perfil-tarjeta" aria-labelledby="perfil-datos-titulo">
              <div className="perfil-encabezado">
                <h4 id="perfil-datos-titulo">Datos personales</h4>
                {onEditar && (
                  <button type="button" className="boton-perfil" onClick={() => onEditar(cliente)}>
                    <Icono nombre="lapiz" tamano={16} />
                    Editar datos
                  </button>
                )}
              </div>
              <dl className="perfil-datos">
                <div>
                  <span className="perfil-dato-icono">
                    <Icono nombre="telefono" />
                  </span>
                  <dt>Celular</dt>
                  <dd>{cliente.telefono}</dd>
                </div>
                <div>
                  <span className="perfil-dato-icono">
                    <Icono nombre="correo" />
                  </span>
                  <dt>Correo</dt>
                  <dd>{cliente.correo || <span className="texto-suave">Sin correo registrado</span>}</dd>
                </div>
              </dl>
            </section>

            <section className="perfil-tarjeta" aria-labelledby="perfil-vehiculos-titulo">
              <div className="perfil-encabezado">
                <h4 id="perfil-vehiculos-titulo">
                  Vehículos <span className="perfil-contador">{vehiculos.length}</span>
                </h4>
                <button type="button" className="boton-perfil" onClick={() => setAgregando(true)}>
                  <Icono nombre="mas" tamano={16} />
                  Agregar vehículo
                </button>
              </div>
              {vehiculos.length === 0 ? (
                <div className="perfil-vacio">
                  <span className="perfil-dato-icono">
                    <Icono nombre="carro" />
                  </span>
                  <p>Este cliente aún no tiene vehículos registrados.</p>
                </div>
              ) : (
                <ul className="lista-vehiculos">
                  {vehiculos.map((v) => (
                    <li key={v.id}>
                      <span className="perfil-dato-icono">
                        <Icono nombre={v.tipo === 'moto' ? 'moto' : 'carro'} />
                      </span>
                      <div className="vehiculo-datos">
                        <span className="placa">{v.placa}</span>
                        <span className="texto-suave">{[TIPOS_VEHICULO[v.tipo] ?? v.tipo, v.marca, v.color].filter(Boolean).join(' · ')}</span>
                      </div>
                      <button type="button" className="enlace-accion" aria-label={`Ver historial de ${v.placa}`} onClick={() => setVehiculoAbierto(v)}>
                        Ver historial <span aria-hidden="true">→</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
      {cliente && rol === 'admin' && (
        <div className="modal-acciones">
          <button type="button" className="boton-eliminar" onClick={() => setConfirmandoEliminar(true)}>
            <Icono nombre="papelera" tamano={16} />
            Eliminar cliente
          </button>
        </div>
      )}

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

      {vehiculoAbierto && <DetalleVehiculo vehiculo={vehiculoAbierto} nombreCliente={cliente.nombre} onCerrar={() => setVehiculoAbierto(null)} />}

      {confirmandoEliminar && <ConfirmarEliminarCliente cliente={cliente} onEliminado={onEliminado} onCancelar={() => setConfirmandoEliminar(false)} />}

      {/* Dentro del modal, para que el fondo oscuro no la tape. */}
      <div className="notificaciones" role="status">
        {confirmacion && <Notificacion key={confirmacion.id} titulo={confirmacion.titulo} detalle={confirmacion.detalle} onCerrar={cerrarConfirmacion} />}
      </div>
    </>
  );
}
