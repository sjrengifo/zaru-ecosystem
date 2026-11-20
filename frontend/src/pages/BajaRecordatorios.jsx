// HU-36 CA3 — "No volver a recordarme" desde el enlace del correo, sin iniciar sesión.
//
// /recordatorios/:token/desactivar
//   Solo desactiva los recordatorios del vehículo del enlace. Los avisos del servicio y las
//   promociones se administran aparte (HU-30).
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BellOff, CalendarClock, CircleCheck } from 'lucide-react';
import Cargando from '../components/Cargando.jsx';
import MarcaZaru from '../components/MarcaZaru.jsx';
import { formatoDia, formatoFechaHora } from '../lib/formato.js';
import { consultarRecordatorio, desactivarRecordatorio } from '../services/recordatorios.js';
import '../styles/seguimiento.css';
import '../styles/acceso-cliente.css';

const COLOR_HEX = /^#[0-9A-Fa-f]{6}$/;

function estiloMarca(sede) {
  const estilo = {};
  if (COLOR_HEX.test(sede?.colorPrimario ?? '')) estilo['--color-primario'] = sede.colorPrimario;
  if (COLOR_HEX.test(sede?.colorSecundario ?? '')) estilo['--color-secundario'] = sede.colorSecundario;
  return estilo;
}

function Encabezado({ sede }) {
  return (
    <header className="seg-encabezado">
      {sede?.logoUrl ? (
        <img className="seg-logo" src={sede.logoUrl} alt={sede.nombre} />
      ) : sede?.nombre ? (
        <span className="seg-sede">{sede.nombre}</span>
      ) : (
        <MarcaZaru tamano={28} gota={false} />
      )}
    </header>
  );
}

function Contenido({ token, datos, onConfirmado }) {
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const { sede, vehiculo, activos, proximaFecha, desactivadoAt } = datos;

  async function confirmar() {
    setEnviando(true);
    setError('');
    try {
      onConfirmado(await desactivarRecordatorio(token));
    } catch (e) {
      setError(e.status === 429 ? e.message : 'No pudimos registrar tu solicitud. Inténtalo de nuevo en unos minutos.');
    } finally {
      setEnviando(false);
    }
  }

  if (desactivadoAt || !activos) {
    return (
      <section className="seg-tarjeta seg-vacio baja-tarjeta" aria-live="polite">
        <CircleCheck className="baja-icono baja-icono-ok" size={44} aria-hidden="true" />
        <h1>Listo, no volveremos a recordarte este vehículo</h1>
        <p>
          Desactivamos los recordatorios de próximo lavado para <strong>{vehiculo.placa}</strong>. Seguirás
          recibiendo los avisos de tus servicios y las promociones que hayas autorizado.
        </p>
        {desactivadoAt && (
          <p className="baja-registro">
            Registrado el{' '}
            <strong>
              <time dateTime={desactivadoAt}>{formatoFechaHora(desactivadoAt)}</time>
            </strong>
          </p>
        )}
        <p className="baja-nota">Si cambias de opinión, pídelo en {sede.nombre} y lo activamos de nuevo.</p>
      </section>
    );
  }

  return (
    <section className="seg-tarjeta seg-vacio baja-tarjeta" aria-labelledby="baja-recordatorio-titulo">
      <CalendarClock className="baja-icono" size={44} aria-hidden="true" />
      <h1 id="baja-recordatorio-titulo">¿Dejar de recibir recordatorios de {vehiculo.placa}?</h1>
      <p>
        Te avisamos cuando se acerca la fecha de tu próximo lavado
        {proximaFecha ? <> (estimada para el <strong>{formatoDia(proximaFecha)}</strong>)</> : null} en{' '}
        <strong>{sede.nombre}</strong>.
      </p>
      <p>Si los desactivas, solo dejaremos de enviarte estos recordatorios para este vehículo.</p>
      {error && (
        <p className="seg-error-campo" role="alert">
          {error}
        </p>
      )}
      <button type="button" className="boton boton-ancho" onClick={confirmar} disabled={enviando}>
        {enviando ? 'Registrando…' : 'Sí, no volver a recordarme'}
      </button>
      <p className="baja-nota">
        Tus datos se tratan según la <Link to="/politica-datos">política de tratamiento de datos</Link> (Ley 1581 de 2012).
      </p>
    </section>
  );
}

export default function BajaRecordatorios() {
  const { token } = useParams();
  const [estado, setEstado] = useState({ cargando: true, datos: null, error: null });

  useEffect(() => {
    let vigente = true;
    consultarRecordatorio(token)
      .then((datos) => vigente && setEstado({ cargando: false, datos, error: null }))
      .catch((error) => vigente && setEstado({ cargando: false, datos: null, error }));
    return () => {
      vigente = false;
    };
  }, [token]);

  useEffect(() => {
    document.title = 'Recordatorios de próximo lavado';
  }, []);

  const { cargando, datos, error } = estado;

  return (
    <main className="seguimiento acceso baja" style={estiloMarca(datos?.sede)}>
      <div className="seg-contenido">
        <Encabezado sede={datos?.sede} />
        {cargando ? (
          <Cargando texto="Cargando…" className="seg-cargando" />
        ) : error?.status === 404 ? (
          <section className="seg-tarjeta seg-vacio">
            <BellOff className="baja-icono" size={44} aria-hidden="true" />
            <h1>Este enlace no está disponible</h1>
            <p>{error.message}. Si quieres dejar de recibir recordatorios, pídelo en el establecimiento.</p>
          </section>
        ) : error ? (
          <section className="seg-tarjeta seg-vacio">
            <h1>No pudimos cargar la página</h1>
            <p>{error.status === 429 ? error.message : 'Revisa tu conexión a internet e inténtalo de nuevo.'}</p>
            <button type="button" className="boton" onClick={() => window.location.reload()}>
              Reintentar
            </button>
          </section>
        ) : (
          <Contenido token={token} datos={datos} onConfirmado={(r) => setEstado({ cargando: false, datos: r, error: null })} />
        )}
      </div>
      <footer className="seg-pie">
        Con tecnología de <MarcaZaru tamano={16} gota={false} />
      </footer>
    </main>
  );
}
