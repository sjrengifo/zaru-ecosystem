// HU-08 + HU-46 CA1 · Ingreso de un vehículo: placa → servicios → total. Al guardar, la API
// envía al cliente el correo de confirmación con los servicios solicitados.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api.js';
import { formatoMoneda } from '../lib/formato.js';

const ESPERA_BUSQUEDA_MS = 250;

export default function FormularioIngreso({ onCreada, onCancelar }) {
  const [placa, setPlaca] = useState('');
  const [vehiculos, setVehiculos] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [vehiculo, setVehiculo] = useState(null);
  const [servicios, setServicios] = useState([]);
  const [seleccionados, setSeleccionados] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/servicios')
      .then((lista) => setServicios(lista.filter((s) => s.activo !== false)))
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    const texto = placa.replace(/[^A-Za-z0-9]/g, '');
    if (vehiculo || texto.length < 2) { setVehiculos([]); return undefined; }
    let vigente = true;
    setBuscando(true);
    const espera = setTimeout(() => {
      api.get(`/vehiculos?placa=${encodeURIComponent(texto)}`)
        .then((lista) => vigente && setVehiculos(lista.slice(0, 6)))
        .catch((e) => vigente && setError(e.message))
        .finally(() => vigente && setBuscando(false));
    }, ESPERA_BUSQUEDA_MS);
    return () => { vigente = false; clearTimeout(espera); };
  }, [placa, vehiculo]);

  const total = useMemo(
    () => servicios.filter((s) => seleccionados.includes(s.id)).reduce((suma, s) => suma + Number(s.precio), 0),
    [servicios, seleccionados],
  );

  const alternar = (id) => setSeleccionados((actual) => (actual.includes(id) ? actual.filter((x) => x !== id) : [...actual, id]));

  async function guardar(e) {
    e.preventDefault();
    if (!vehiculo) return setError('Busca y selecciona el vehículo por su placa.');
    if (!seleccionados.length) return setError('Selecciona al menos un servicio.');
    setGuardando(true);
    setError('');
    try {
      const orden = await api.post('/ordenes', { vehiculoId: vehiculo.id, servicios: seleccionados });
      onCreada(orden);
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  const sinCoincidencias = !vehiculo && !buscando && placa.replace(/[^A-Za-z0-9]/g, '').length >= 2 && !vehiculos.length;

  return (
    <form className="modal-cuerpo formulario-ingreso" onSubmit={guardar} noValidate>
      <label htmlFor="ingreso-placa">Placa del vehículo</label>
      {vehiculo ? (
        <div className="vehiculo-elegido">
          <span className="placa">{vehiculo.placa}</span>
          <span className="texto-suave">{vehiculo.clientes?.nombre}</span>
          <button type="button" className="boton secundario boton-pequeno" onClick={() => { setVehiculo(null); setPlaca(''); }}>Cambiar</button>
        </div>
      ) : (
        <>
          <input
            id="ingreso-placa"
            data-foco-inicial
            value={placa}
            onChange={(e) => setPlaca(e.target.value.toUpperCase())}
            placeholder="Ej. ABC123"
            autoComplete="off"
            maxLength={10}
          />
          {vehiculos.length > 0 && (
            <ul className="lista-resultados" aria-label="Vehículos encontrados">
              {vehiculos.map((v) => (
                <li key={v.id}>
                  <button type="button" onClick={() => setVehiculo(v)}>
                    <span className="placa">{v.placa}</span> <span>{v.clientes?.nombre}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {buscando && <p className="texto-suave">Buscando…</p>}
          {sinCoincidencias && (
            <p className="aviso aviso-info">No hay vehículos con esa placa. Regístralo desde <Link to="/clientes">Clientes</Link> y vuelve a intentarlo.</p>
          )}
        </>
      )}

      <fieldset className="grupo-opciones">
        <legend>Servicios solicitados</legend>
        <div className="lista-servicios">
          {servicios.map((s) => (
            <label key={s.id} className="casilla">
              <input type="checkbox" checked={seleccionados.includes(s.id)} onChange={() => alternar(s.id)} />
              <span>{s.nombre}</span>
              <span className="texto-suave">{formatoMoneda(Number(s.precio))}</span>
            </label>
          ))}
          {!servicios.length && <p className="texto-suave">No hay servicios activos en el catálogo.</p>}
        </div>
      </fieldset>

      <p className="ingreso-total">Total: <strong>{formatoMoneda(total)}</strong></p>
      <p className="texto-suave">Si el cliente tiene correo, recibirá la confirmación con estos servicios.</p>

      {error && <p className="aviso aviso-error" role="alert">{error}</p>}

      <div className="modal-acciones">
        <button type="button" className="boton secundario" onClick={onCancelar}>Cancelar</button>
        <button className="boton" disabled={guardando} aria-busy={guardando}>{guardando ? 'Registrando…' : 'Registrar ingreso'}</button>
      </div>
    </form>
  );
}
