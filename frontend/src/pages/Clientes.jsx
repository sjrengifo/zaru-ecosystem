// HU-03 y HU-04 · Clientes (ZARU-4, ZARU-5)
// 📘 EJEMPLO DE REFERENCIA: así se piden datos al backend y se muestran en una tabla.
import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api.js';
import Modal from '../components/Modal.jsx';
import Notificacion from '../components/Notificacion.jsx';
import FormularioCliente from '../components/FormularioCliente.jsx';
import DetalleCliente from '../components/DetalleCliente.jsx';
import FormularioEditarCliente from '../components/FormularioEditarCliente.jsx';
import FormularioVehiculo from '../components/FormularioVehiculo.jsx';

const ESPERA_BUSQUEDA_MS = 250;

export default function Clientes() {
  const [clientes, setClientes] = useState([]);
  const [buscar, setBuscar] = useState('');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [recargas, setRecargas] = useState(0);
  const [registrando, setRegistrando] = useState(false);
  const [clienteAbierto, setClienteAbierto] = useState(null);
  const [clienteEditando, setClienteEditando] = useState(null);
  const [clienteConVehiculoNuevo, setClienteConVehiculoNuevo] = useState(null);
  const [confirmacion, setConfirmacion] = useState(null);
  const cerrarConfirmacion = useCallback(() => setConfirmacion(null), []);

  useEffect(() => {
    let vigente = true; // Una respuesta lenta no reemplaza los resultados de una búsqueda más reciente.
    const espera = setTimeout(() => {
      const ruta = buscar ? `/clientes?buscar=${encodeURIComponent(buscar)}` : '/clientes';
      api
        .get(ruta)
        .then((lista) => {
          if (!vigente) return;
          setClientes(lista);
          setError('');
        })
        .catch((e) => vigente && setError(e.message))
        .finally(() => vigente && setCargando(false));
    }, buscar ? ESPERA_BUSQUEDA_MS : 0);

    return () => {
      vigente = false;
      clearTimeout(espera);
    };
  }, [buscar, recargas]);

  function alCrear(cliente) {
    setRegistrando(false);
    setBuscar(''); // Una búsqueda activa podría ocultar al cliente recién creado.
    setRecargas((n) => n + 1);
    // CA1: el cliente queda creado con la fecha de autorización registrada.
    setConfirmacion({ id: Date.now(), titulo: 'Cliente registrado', detalle: `${cliente.nombre}. Autorización de datos: ${new Date(cliente.fecha_autorizacion).toLocaleString('es-CO')}` });
  }

  function alEditar(cliente) {
    setClienteEditando(null);
    setClienteAbierto(null);
    setRecargas((n) => n + 1);
    // HU-04 CA2: mensaje de confirmación. La búsqueda se conserva para seguir donde se estaba.
    setConfirmacion({ id: Date.now(), titulo: 'Cambios guardados', detalle: cliente.nombre });
  }

  function alRegistrarVehiculo(vehiculo) {
    setConfirmacion({ id: Date.now(), titulo: 'Vehículo registrado', detalle: `${vehiculo.placa} · ${clienteConVehiculoNuevo.nombre}` });
    setClienteConVehiculoNuevo(null);
    setRecargas((n) => n + 1);
  }

  function abrirCliente(id, titulo) {
    setConfirmacion(null);
    setClienteAbierto({ id, titulo });
  }

  function abrirExistente(id) {
    setRegistrando(false);
    setClienteEditando(null);
    abrirCliente(id, 'Cliente existente');
  }

  return (
    <section>
      <div className="encabezado">
        <h2>Clientes</h2>
        <button
          className="boton"
          onClick={() => {
            setConfirmacion(null);
            setRegistrando(true);
          }}
        >
          + Nuevo cliente
        </button>
      </div>

      {/* La región existe siempre para que los lectores de pantalla anuncien la notificación al aparecer. */}
      <div className="notificaciones" role="status">
        {confirmacion && <Notificacion key={confirmacion.id} titulo={confirmacion.titulo} detalle={confirmacion.detalle} onCerrar={cerrarConfirmacion} />}
      </div>

      {registrando && <FormularioCliente onCreado={alCrear} onAbrirExistente={abrirExistente} onCancelar={() => setRegistrando(false)} />}

      {clienteAbierto && (
        <Modal titulo={clienteAbierto.titulo} onCerrar={() => setClienteAbierto(null)}>
          <DetalleCliente
            id={clienteAbierto.id}
            onEditar={setClienteEditando}
            onCerrar={() => setClienteAbierto(null)}
            onAbrirCliente={(id) => abrirCliente(id, 'Detalle del cliente')}
            onVehiculoRegistrado={() => setRecargas((n) => n + 1)}
          />
        </Modal>
      )}

      {clienteConVehiculoNuevo && (
        <FormularioVehiculo
          cliente={clienteConVehiculoNuevo}
          onRegistrado={alRegistrarVehiculo}
          onAbrirCliente={(id) => {
            setClienteConVehiculoNuevo(null);
            abrirCliente(id, 'Detalle del cliente');
          }}
          onCancelar={() => setClienteConVehiculoNuevo(null)}
        />
      )}

      {/* El detalle queda abierto debajo: al cancelar la edición se vuelve a él. */}
      {clienteEditando && (
        <FormularioEditarCliente
          key={clienteEditando.id}
          cliente={clienteEditando}
          onGuardado={alEditar}
          onAbrirExistente={abrirExistente}
          onCancelar={() => setClienteEditando(null)}
        />
      )}

      <input
        type="search"
        aria-label="Buscar clientes por nombre, teléfono o placa"
        placeholder="Buscar por nombre, teléfono o placa…"
        maxLength={60}
        value={buscar}
        onChange={(e) => setBuscar(e.target.value)}
      />

      {error && (
        <div className="aviso aviso-error" role="alert">
          <p>{error}</p>
        </div>
      )}

      <div className="tabla-contenedor">
        <table className="tabla">
          <thead>
            <tr>
              <th scope="col">Nombre</th>
              <th scope="col">Teléfono</th>
              <th scope="col">Correo</th>
              <th scope="col">Vehículos</th>
              <th scope="col" className="tabla-acciones" aria-label="Acciones" />
            </tr>
          </thead>
          <tbody>
            {clientes.map((c) => (
              <tr key={c.id}>
                <td>
                  <button type="button" className="enlace-tabla" onClick={() => abrirCliente(c.id, 'Detalle del cliente')}>
                    {c.nombre}
                  </button>
                </td>
                <td>{c.telefono}</td>
                <td>{c.correo || '—'}</td>
                <td>{c.vehiculos?.map((v) => v.placa).join(', ') || '—'}</td>
                <td className="tabla-acciones">
                  <button
                    type="button"
                    className="boton-fila"
                    title="Agregar vehículo"
                    aria-label={`Agregar vehículo a ${c.nombre}`}
                    onClick={() => {
                      setConfirmacion(null);
                      setClienteConVehiculoNuevo(c);
                    }}
                  >
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M14 16H9m10 0h3v-3.15a1 1 0 0 0-.84-.99L16 11l-2.7-3.6a1 1 0 0 0-.8-.4H5.24a2 2 0 0 0-1.8 1.1l-.8 1.63A6 6 0 0 0 2 12.42V16h2" />
                      <circle cx="6.5" cy="16.5" r="2.5" />
                      <circle cx="16.5" cy="16.5" r="2.5" />
                      <path d="M19 2v6M16 5h6" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="boton-fila"
                    title="Editar"
                    aria-label={`Editar a ${c.nombre}`}
                    onClick={() => {
                      setConfirmacion(null);
                      setClienteEditando(c);
                    }}
                  >
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                    </svg>
                  </button>
                </td>
              </tr>
            ))}
            {clientes.length === 0 && !error && (
              <tr>
                <td colSpan={5} className="tabla-vacia">
                  {cargando ? 'Cargando clientes…' : buscar ? `No hay clientes que coincidan con "${buscar}".` : 'Aún no hay clientes. Registra el primero con "+ Nuevo cliente".'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
