// HU-38 — Centro de notificaciones del cliente final en la app.
//
// /s/:slug/notificaciones. El cliente entra con el mismo pase del historial (placa + celular, HU-23).
//   CA1: lista sus avisos de los últimos 90 días, del más reciente al más antiguo, y distingue las
//        leídas de las no leídas.
//   CA2: muestra cuántos avisos siguen pendientes (también en la campana del encabezado).
//   CA3: al abrir un aviso de estado lleva al seguimiento o, si ya se entregó, al detalle del historial.
//
// El cliente y la sede salen del pase firmado; es una página pública, sin sesión del panel.
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Bell, BellOff, ChevronRight, Info, Megaphone, TriangleAlert } from 'lucide-react';
import Cargando from '../components/Cargando.jsx';
import FormularioPase from '../components/FormularioPase.jsx';
import MarcaZaru from '../components/MarcaZaru.jsx';
import { formatoFechaHora } from '../lib/formato.js';
import { conLeida, rutaDestino } from '../lib/notificacionesCliente.js';
import { obtenerSede } from '../services/accesoCliente.js';
import { guardarPase, leerPase } from '../services/historialCliente.js';
import { listarNotificacionesCliente, marcarNotificacionLeida } from '../services/notificacionesCliente.js';
import '../styles/seguimiento.css';
import '../styles/acceso-cliente.css';
import '../styles/historial-cliente.css';
import '../styles/notificaciones-cliente.css';

const COLOR_HEX = /^#[0-9A-Fa-f]{6}$/;
const AVISO_VENCIDO = 'Tu acceso venció. Verifica de nuevo tu placa y celular.';

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

function TarjetaNotificacion({ notificacion, slug, onAbrir }) {
  const ruta = rutaDestino(slug, notificacion.destino);
  const Icono = notificacion.tipo === 'comercial' ? Megaphone : Bell;
  const clases = ['notif-tarjeta', notificacion.leida ? 'notif-leida' : 'notif-no-leida'].join(' ');

  return (
    <li className="notif-item">
      <button type="button" className={clases} onClick={() => onAbrir(notificacion, ruta)}>
        <span className="notif-icono" aria-hidden="true"><Icono size={18} /></span>
        <span className="notif-cuerpo">
          <span className="notif-cabecera">
            <span className="notif-categoria">{notificacion.categoria}</span>
            <time className="notif-fecha" dateTime={notificacion.fecha}>{formatoFechaHora(notificacion.fecha)}</time>
          </span>
          <span className="notif-titulo">
            {!notificacion.leida && <span className="notif-punto" aria-hidden="true" />}
            {notificacion.titulo}
          </span>
          <span className="solo-lectores">{notificacion.leida ? 'Leída' : 'Sin leer'}</span>
          {ruta && (
            <span className="notif-accion">
              {notificacion.destino.pantalla === 'seguimiento' ? 'Ver seguimiento' : 'Ver detalle del servicio'}
              <ChevronRight size={16} aria-hidden="true" />
            </span>
          )}
        </span>
      </button>
    </li>
  );
}

export default function NotificacionesCliente() {
  const { slug } = useParams();
  const navegar = useNavigate();
  const [sedeEstado, setSedeEstado] = useState({ cargando: true, sede: null, error: null });
  const [pase, setPase] = useState(() => leerPase(slug));
  const [centro, setCentro] = useState({ notificaciones: [], noLeidas: 0 });
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [avisoSesion, setAvisoSesion] = useState('');
  const [recargas, setRecargas] = useState(0);

  useEffect(() => {
    let vigente = true;
    setSedeEstado({ cargando: true, sede: null, error: null });
    obtenerSede(slug)
      .then((sede) => vigente && setSedeEstado({ cargando: false, sede, error: null }))
      .catch((err) => vigente && setSedeEstado({ cargando: false, sede: null, error: err }));
    return () => {
      vigente = false;
    };
  }, [slug]);

  useEffect(() => {
    if (sedeEstado.sede?.nombre) document.title = `${sedeEstado.sede.nombre} · Notificaciones`;
  }, [sedeEstado.sede]);

  const vencerPase = () => {
    guardarPase(slug, null);
    setPase(null);
    setCentro({ notificaciones: [], noLeidas: 0 });
    setAvisoSesion(AVISO_VENCIDO);
  };

  useEffect(() => {
    if (!pase) return undefined;
    let vigente = true;
    setCargando(true);
    setError('');
    listarNotificacionesCliente(pase)
      .then((datos) => vigente && setCentro({ notificaciones: datos.notificaciones ?? [], noLeidas: datos.noLeidas ?? 0 }))
      .catch((err) => {
        if (!vigente) return;
        if (err.status === 401) {
          vencerPase();
          return;
        }
        setError(err.message || 'No pudimos cargar tus notificaciones.');
      })
      .finally(() => vigente && setCargando(false));
    return () => {
      vigente = false;
    };
  }, [pase, slug, recargas]);

  const alEntrar = (datos) => {
    guardarPase(slug, datos.pase);
    setAvisoSesion('');
    setPase(datos.pase);
  };

  // Abrir un aviso lo marca como leído; si es de estado, lleva a su pantalla (CA3).
  const abrir = async (notificacion, ruta) => {
    if (!notificacion.leida) {
      setCentro((actual) => conLeida(actual, notificacion.id));
      try {
        await marcarNotificacionLeida(pase, notificacion.id);
      } catch (err) {
        if (err.status === 401) {
          vencerPase();
          return;
        }
        // Si no se pudo guardar, se vuelve a pedir la lista para no mostrar un estado falso.
        if (!ruta) setRecargas((n) => n + 1);
      }
    }
    if (ruta) navegar(ruta);
  };

  const { cargando: cargandoSede, sede, error: errorSede } = sedeEstado;
  const { notificaciones, noLeidas } = centro;

  return (
    <main className="seguimiento historial-cliente notificaciones-cliente" style={estiloMarca(sede)}>
      <div className="seg-contenido">
        <Encabezado sede={sede} />

        {cargandoSede ? (
          <Cargando texto="Cargando…" className="seg-cargando" />
        ) : errorSede?.status === 404 ? (
          <section className="seg-tarjeta seg-vacio">
            <h1>Este enlace no está disponible</h1>
            <p>No encontramos un car wash activo con esta dirección. Revisa el enlace o el código QR que te dieron.</p>
          </section>
        ) : errorSede ? (
          <section className="seg-tarjeta seg-vacio">
            <h1>No pudimos cargar la página</h1>
            <p>Revisa tu conexión a internet e inténtalo de nuevo.</p>
            <button type="button" className="boton" onClick={() => window.location.reload()}>Reintentar</button>
          </section>
        ) : !pase ? (
          <>
            {avisoSesion && (
              <div className="acceso-aviso acceso-aviso-limite" role="alert">
                <TriangleAlert size={20} aria-hidden="true" />
                <p>{avisoSesion}</p>
              </div>
            )}
            <FormularioPase
              slug={slug}
              alEntrar={alEntrar}
              titulo="Mis notificaciones"
              intro="Verifica tu placa y el celular con el que registraste el vehículo para ver los avisos que te enviamos."
              textoBoton="Ver mis notificaciones"
            />
          </>
        ) : (
          <section className="seg-tarjeta historial-panel" aria-labelledby="notificaciones-titulo">
            <div className="historial-cabecera">
              <div>
                <h1 id="notificaciones-titulo" className="historial-titulo">Notificaciones</h1>
                <p className="historial-subtitulo" role="status">
                  {noLeidas === 0
                    ? 'Estás al día. Avisos de los últimos 90 días.'
                    : `${noLeidas} ${noLeidas === 1 ? 'aviso sin leer' : 'avisos sin leer'} · últimos 90 días`}
                </p>
              </div>
              <Link className="historial-volver" to={`/s/${encodeURIComponent(slug)}`}>
                <ArrowLeft size={16} aria-hidden="true" /> Inicio
              </Link>
            </div>

            {error && (
              <div className="aviso aviso-error" role="alert">
                <p>{error}</p>
                <button type="button" className="boton secundario boton-pequeno" onClick={() => setRecargas((n) => n + 1)}>Reintentar</button>
              </div>
            )}

            {cargando && notificaciones.length === 0 ? (
              <Cargando texto="Cargando tus notificaciones…" className="historial-cargando" />
            ) : !error && notificaciones.length === 0 ? (
              <div className="aviso aviso-info historial-vacio" role="status">
                <BellOff size={20} aria-hidden="true" />
                <div>
                  <p className="historial-vacio-titulo">No tienes notificaciones de los últimos 90 días.</p>
                  <p>Aquí verás los avisos del estado de tu vehículo y las promociones de tu car wash.</p>
                </div>
              </div>
            ) : (
              <ul className="notif-lista">
                {notificaciones.map((n) => (
                  <TarjetaNotificacion key={n.id} notificacion={n} slug={slug} onAbrir={abrir} />
                ))}
              </ul>
            )}

            <p className="notif-pie">
              <Info size={14} aria-hidden="true" /> Toca un aviso del estado de tu vehículo para ver su seguimiento o el detalle del servicio.
            </p>
          </section>
        )}
      </div>

      <footer className="seg-pie">
        Con tecnología de <MarcaZaru tamano={16} gota={false} />
      </footer>
    </main>
  );
}
