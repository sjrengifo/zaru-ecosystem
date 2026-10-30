// HU-03 y HU-04 · Clientes (ZARU-4, ZARU-5)
// 📘 EJEMPLO DE REFERENCIA: así se piden datos al backend y se muestran en una tabla.
import { useEffect, useState } from 'react';
import { api } from '../services/api.js';
import Modal from '../components/Modal.jsx';
import FormularioCliente from '../components/FormularioCliente.jsx';
import DetalleCliente from '../components/DetalleCliente.jsx';

const ESPERA_BUSQUEDA_MS = 250;

export default function Clientes() {
  const [clientes, setClientes] = useState([]);
  const [buscar, setBuscar] = useState('');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [recargas, setRecargas] = useState(0);
  const [registrando, setRegistrando] = useState(false);
  const [clienteAbierto, setClienteAbierto] = useState(null);
  const [confirmacion, setConfirmacion] = useState(null);

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
    setConfirmacion({ nombre: cliente.nombre, fecha: new Date(cliente.fecha_autorizacion).toLocaleString('es-CO') });
  }

  function abrirExistente(id) {
    setRegistrando(false);
    setClienteAbierto(id);
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

      <div role="status">
        {confirmacion && (
          <div className="aviso aviso-exito">
            <span aria-hidden="true">✓</span>
            <p>
              <strong>Cliente registrado: {confirmacion.nombre}.</strong> Autorización de datos: {confirmacion.fecha}
            </p>
            <button type="button" className="boton-icono" aria-label="Cerrar mensaje" onClick={() => setConfirmacion(null)}>
              ×
            </button>
          </div>
        )}
      </div>

      {registrando && <FormularioCliente onCreado={alCrear} onAbrirExistente={abrirExistente} onCancelar={() => setRegistrando(false)} />}

      {clienteAbierto && (
        <Modal titulo="Cliente existente" onCerrar={() => setClienteAbierto(null)}>
          <DetalleCliente id={clienteAbierto} onCerrar={() => setClienteAbierto(null)} />
        </Modal>
      )}

      <input
        type="search"
        aria-label="Buscar clientes por nombre o teléfono"
        placeholder="Buscar por nombre o teléfono…"
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
            </tr>
          </thead>
          <tbody>
            {clientes.map((c) => (
              <tr key={c.id}>
                <td>{c.nombre}</td>
                <td>{c.telefono}</td>
                <td>{c.correo || '—'}</td>
                <td>{c.vehiculos?.map((v) => v.placa).join(', ') || '—'}</td>
              </tr>
            ))}
            {clientes.length === 0 && !error && (
              <tr>
                <td colSpan={4} className="tabla-vacia">
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
