// HU-03 y HU-04 · Clientes (ZARU-4, ZARU-5)
// 📘 EJEMPLO DE REFERENCIA: así se piden datos al backend y se muestran en una tabla.
import { useEffect, useState } from 'react';
import { api } from '../services/api.js';

export default function Clientes() {
  const [clientes, setClientes] = useState([]);
  const [buscar, setBuscar] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const ruta = buscar ? `/clientes?buscar=${encodeURIComponent(buscar)}` : '/clientes';
    api.get(ruta).then(setClientes).catch((e) => setError(e.message));
  }, [buscar]);

  return (
    <section>
      <div className="encabezado">
        <h2>Clientes</h2>
        {/* TODO HU-03: formulario de registro con casilla de autorización de datos */}
        <button className="boton">+ Nuevo cliente</button>
      </div>

      <input
        placeholder="Buscar por nombre o teléfono…"
        value={buscar}
        onChange={(e) => setBuscar(e.target.value)}
      />

      {error && <p className="error">{error}</p>}

      <table className="tabla">
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Teléfono</th>
            <th>Correo</th>
            <th>Vehículos</th>
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
        </tbody>
      </table>
    </section>
  );
}
