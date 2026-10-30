// HU-05 y HU-06 · Vehículos del establecimiento y su historial (ZARU-6, ZARU-7). Se registran desde el perfil de cada cliente.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api.js';
import { TIPOS_VEHICULO } from '../lib/validacionVehiculo.js';
import Modal from '../components/Modal.jsx';
import DetalleCliente from '../components/DetalleCliente.jsx';
import DetalleVehiculo from '../components/DetalleVehiculo.jsx';

const ESPERA_BUSQUEDA_MS = 250;

export default function Vehiculos() {
  const [vehiculos, setVehiculos] = useState([]);
  const [buscar, setBuscar] = useState('');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [recargas, setRecargas] = useState(0);
  const [clienteAbierto, setClienteAbierto] = useState(null);
  const [vehiculoAbierto, setVehiculoAbierto] = useState(null);

  useEffect(() => {
    let vigente = true; // Una respuesta lenta no reemplaza los resultados de una búsqueda más reciente.
    const espera = setTimeout(() => {
      const ruta = buscar ? `/vehiculos?placa=${encodeURIComponent(buscar)}` : '/vehiculos';
      api
        .get(ruta)
        .then((lista) => {
          if (!vigente) return;
          setVehiculos(lista);
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

  return (
    <section>
      <div className="encabezado">
        <h2>Vehículos</h2>
      </div>
      <p className="texto-suave">
        Para registrar un vehículo, ve a <Link to="/clientes">Clientes</Link> y usa el ícono de agregar vehículo en la fila del cliente.
      </p>

      {clienteAbierto && (
        <Modal titulo="Detalle del cliente" onCerrar={() => setClienteAbierto(null)}>
          <DetalleCliente
            id={clienteAbierto}
            onCerrar={() => setClienteAbierto(null)}
            onAbrirCliente={setClienteAbierto}
            onVehiculoRegistrado={() => setRecargas((n) => n + 1)}
          />
        </Modal>
      )}

      {vehiculoAbierto && <DetalleVehiculo vehiculo={vehiculoAbierto} nombreCliente={vehiculoAbierto.clientes.nombre} onCerrar={() => setVehiculoAbierto(null)} />}

      <input
        type="search"
        aria-label="Buscar vehículos por placa"
        placeholder="Buscar por placa…"
        maxLength={20}
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
              <th scope="col">Placa</th>
              <th scope="col">Tipo</th>
              <th scope="col">Marca</th>
              <th scope="col">Color</th>
              <th scope="col">Cliente</th>
              <th scope="col" className="tabla-acciones" aria-label="Acciones" />
            </tr>
          </thead>
          <tbody>
            {vehiculos.map((v) => (
              <tr key={v.id}>
                <td>
                  <button type="button" className="enlace-tabla" onClick={() => setVehiculoAbierto(v)}>
                    <span className="placa">{v.placa}</span>
                  </button>
                </td>
                <td data-etiqueta="Tipo">{TIPOS_VEHICULO[v.tipo] ?? v.tipo}</td>
                <td data-etiqueta="Marca">{v.marca || '—'}</td>
                <td data-etiqueta="Color">{v.color || '—'}</td>
                <td data-etiqueta="Cliente">
                  <button type="button" className="enlace-tabla" onClick={() => setClienteAbierto(v.clientes.id)}>
                    {v.clientes.nombre}
                  </button>
                </td>
                <td className="tabla-acciones">
                  <button type="button" className="boton-fila" title="Ver historial" aria-label={`Ver historial de ${v.placa}`} onClick={() => setVehiculoAbierto(v)}>
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
                      <path d="M3 3v5h5" />
                      <path d="M12 7v5l4 2" />
                    </svg>
                  </button>
                </td>
              </tr>
            ))}
            {vehiculos.length === 0 && !error && (
              <tr>
                <td colSpan={6} className="tabla-vacia">
                  {cargando ? 'Cargando vehículos…' : buscar ? `No hay vehículos que coincidan con "${buscar}".` : 'Aún no hay vehículos registrados.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
