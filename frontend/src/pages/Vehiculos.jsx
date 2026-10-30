// HU-05 · Vehículos del establecimiento (ZARU-6). Se registran desde el perfil de cada cliente.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api.js';
import { TIPOS_VEHICULO } from '../lib/validacionVehiculo.js';
import Modal from '../components/Modal.jsx';
import DetalleCliente from '../components/DetalleCliente.jsx';

const ESPERA_BUSQUEDA_MS = 250;

export default function Vehiculos() {
  const [vehiculos, setVehiculos] = useState([]);
  const [buscar, setBuscar] = useState('');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [recargas, setRecargas] = useState(0);
  const [clienteAbierto, setClienteAbierto] = useState(null);

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
            </tr>
          </thead>
          <tbody>
            {vehiculos.map((v) => (
              <tr key={v.id}>
                <td>
                  <span className="placa">{v.placa}</span>
                </td>
                <td>{TIPOS_VEHICULO[v.tipo] ?? v.tipo}</td>
                <td>{v.marca || '—'}</td>
                <td>{v.color || '—'}</td>
                <td>
                  <button type="button" className="enlace-tabla" onClick={() => setClienteAbierto(v.clientes.id)}>
                    {v.clientes.nombre}
                  </button>
                </td>
              </tr>
            ))}
            {vehiculos.length === 0 && !error && (
              <tr>
                <td colSpan={5} className="tabla-vacia">
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
