// HU-23 / HU-24 — Historial de servicios del cliente final.
//
// El cliente entra desde /s/{slug}/historial, confirma que es dueño de su vehículo con **placa +
// celular** y recibe un pase firmado de vida corta. Con el pase se listan solo sus órdenes
// entregadas, de la más reciente a la más antigua, y se abre el detalle de una única orden.
//
// El establecimiento y el cliente salen del pase firmado: escribir otro id en la URL no da acceso a
// datos ajenos (la API responde 404/401). Es una página pública, sin sesión del panel.
import { useEffect, useId, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CarFront, ChevronRight, Clock, Droplets, Info, MapPin, Receipt, Search, TriangleAlert } from 'lucide-react';
import Cargando from '../components/Cargando.jsx';
import MarcaZaru from '../components/MarcaZaru.jsx';
import Modal from '../components/Modal.jsx';
import { formatoFechaHora, formatoMoneda } from '../lib/formato.js';
import { errorBusqueda, formatoCelular, limpiarCelular, limpiarPlaca } from '../lib/accesoCliente.js';
import { obtenerSede } from '../services/accesoCliente.js';
import {
  accederHistorial,
  guardarPase,
  leerPase,
  listarHistorialCliente,
  listarVehiculosCliente,
  obtenerDetalleHistorialCliente,
} from '../services/historialCliente.js';
import '../styles/seguimiento.css';
import '../styles/acceso-cliente.css';
import '../styles/historial-cliente.css';

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

/** Formulario de verificación: placa + celular juntos (son la prueba de propiedad del vehículo). */
function FormularioAcceso({ slug, alEntrar }) {
  const idBase = useId();
  const campoPlaca = useRef(null);
  const [placa, setPlaca] = useState('');
  const [celular, setCelular] = useState('');
  const [errores, setErrores] = useState({ placa: '', celular: '' });
  const [aviso, setAviso] = useState(null); // { tipo: 'no-encontrado' | 'limite' | 'error', texto }
  const [enviando, setEnviando] = useState(false);

  const enviar = async (evento) => {
    evento.preventDefault();
    if (enviando) return;
    const errorPlaca = errorBusqueda('placa', placa);
    const errorCelular = errorBusqueda('celular', celular);
    setErrores({ placa: errorPlaca, celular: errorCelular });
    setAviso(null);
    if (errorPlaca || errorCelular) {
      if (errorPlaca) campoPlaca.current?.focus();
      return;
    }
    setEnviando(true);
    try {
      const datos = await accederHistorial(slug, { placa: limpiarPlaca(placa), celular: limpiarCelular(celular) });
      alEntrar(datos);
    } catch (err) {
      if (err.status === 404) {
        setAviso({
          tipo: 'no-encontrado',
          texto: 'No encontramos un vehículo con esa placa y celular en esta sede.',
        });
      } else if (err.status === 429) {
        setAviso({ tipo: 'limite', texto: err.message });
      } else if (err.status === 400) {
        setErrores({
          placa: err.detalles?.find((d) => d.campo === 'placa')?.mensaje ?? '',
          celular: err.detalles?.find((d) => d.campo === 'celular')?.mensaje ?? '',
        });
      } else {
        setAviso({ tipo: 'error', texto: 'No pudimos conectarnos. Revisa tu conexión e inténtalo de nuevo.' });
      }
    } finally {
      setEnviando(false);
    }
  };

  return (
    <section className="seg-tarjeta acceso-tarjeta" aria-labelledby="historial-acceso-titulo">
      <h1 id="historial-acceso-titulo" className="acceso-titulo">Mi historial de servicios</h1>
      <p className="acceso-intro">
        Verifica tu placa y el celular con el que registraste el vehículo. Solo tú verás tus servicios.
      </p>

      <form onSubmit={enviar} noValidate>
        <label htmlFor={`${idBase}-placa`} className="acceso-etiqueta">Placa del vehículo</label>
        <div className="acceso-campo acceso-campo-placa">
          <input
            ref={campoPlaca}
            id={`${idBase}-placa`}
            value={placa}
            onChange={(e) => {
              setPlaca(limpiarPlaca(e.target.value));
              setErrores((previos) => ({ ...previos, placa: '' }));
              setAviso(null);
            }}
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            placeholder="ABC123"
            aria-invalid={Boolean(errores.placa)}
            aria-describedby={`${idBase}-placa-ayuda`}
            disabled={enviando}
          />
        </div>
        <p id={`${idBase}-placa-ayuda`} className={errores.placa ? 'seg-error-campo' : 'acceso-ayuda'} role={errores.placa ? 'alert' : undefined}>
          {errores.placa || 'Escríbela sin espacios ni guiones.'}
        </p>

        <label htmlFor={`${idBase}-celular`} className="acceso-etiqueta historial-etiqueta-celular">Número de celular</label>
        <div className="acceso-campo acceso-campo-celular">
          <span className="acceso-prefijo" aria-hidden="true">+57</span>
          <input
            id={`${idBase}-celular`}
            value={formatoCelular(celular)}
            onChange={(e) => {
              setCelular(limpiarCelular(e.target.value));
              setErrores((previos) => ({ ...previos, celular: '' }));
              setAviso(null);
            }}
            inputMode="numeric"
            autoComplete="tel-national"
            placeholder="300 123 4567"
            aria-invalid={Boolean(errores.celular)}
            aria-describedby={`${idBase}-celular-ayuda`}
            disabled={enviando}
          />
        </div>
        <p id={`${idBase}-celular-ayuda`} className={errores.celular ? 'seg-error-campo' : 'acceso-ayuda'} role={errores.celular ? 'alert' : undefined}>
          {errores.celular || 'El mismo celular que diste al registrar tu vehículo.'}
        </p>

        <button type="submit" className="boton boton-grande acceso-boton" disabled={enviando} aria-busy={enviando}>
          {enviando ? (
            <>
              <span className="spinner" aria-hidden="true" />
              Verificando…
            </>
          ) : (
            <>
              Ver mis servicios
              <Search size={18} aria-hidden="true" />
            </>
          )}
        </button>
      </form>

      {aviso && (
        <div className={`acceso-aviso acceso-aviso-${aviso.tipo === 'no-encontrado' ? 'sin-servicio' : aviso.tipo}`} role="alert">
          {aviso.tipo === 'no-encontrado' ? <Info size={20} aria-hidden="true" /> : <TriangleAlert size={20} aria-hidden="true" />}
          <div>
            <p className="acceso-aviso-titulo">{aviso.texto.replace(/\.?$/, '.')}</p>
            {aviso.tipo === 'no-encontrado' && (
              <p>Revisa que la placa y el celular estén bien escritos o pregunta en la recepción del car wash.</p>
            )}
          </div>
        </div>
      )}

      <p className="acceso-codigo">
        <Link to={`/s/${encodeURIComponent(slug)}`}>Volver al inicio</Link>
      </p>
    </section>
  );
}

/** Detalle de una única orden entregada (HU-24). */
function DetalleServicio({ pase, ordenId, onCerrar, onVencer }) {
  const [estado, setEstado] = useState({ cargando: true, servicio: null, error: '' });

  useEffect(() => {
    let vigente = true;
    setEstado({ cargando: true, servicio: null, error: '' });
    obtenerDetalleHistorialCliente(pase, ordenId)
      .then((datos) => vigente && setEstado({ cargando: false, servicio: datos.servicio, error: '' }))
      .catch((error) => {
        if (!vigente) return;
        if (error.status === 401) {
          onVencer();
          return;
        }
        setEstado({ cargando: false, servicio: null, error: error.message });
      });
    return () => {
      vigente = false;
    };
  }, [pase, ordenId, onVencer]);

  const { cargando, servicio, error } = estado;

  return (
    <Modal titulo="Detalle del servicio" onCerrar={onCerrar}>
      <div className="modal-cuerpo historial-detalle">
        {cargando && <Cargando texto="Cargando el servicio…" />}
        {error && (
          <div className="aviso aviso-error" role="alert">
            <p>{error}</p>
          </div>
        )}
        {servicio && (
          <>
            <div className="historial-detalle-cabecera">
              <span className="placa placa-azul placa-grande">{servicio.placa}</span>
              <span className="estado-etiqueta estado-etiqueta-entregado">Entregado</span>
            </div>
            <dl className="historial-detalle-datos">
              <div><dt><Clock size={14} aria-hidden="true" /> Fecha</dt><dd>{formatoFechaHora(servicio.fecha)}</dd></div>
              <div><dt><MapPin size={14} aria-hidden="true" /> Sede</dt><dd>{servicio.sede || '—'}</dd></div>
              <div><dt><CarFront size={14} aria-hidden="true" /> Vehículo</dt><dd>{[servicio.vehiculo?.marca, servicio.vehiculo?.tipo, servicio.vehiculo?.color].filter(Boolean).join(' · ') || '—'}</dd></div>
              <div><dt><Droplets size={14} aria-hidden="true" /> Tipo de lavado</dt><dd>{servicio.tipoLavado}</dd></div>
            </dl>

            <h4 className="historial-servicios-titulo">Servicios realizados</h4>
            <ul className="historial-servicios">
              {servicio.servicios.map((linea, indice) => (
                <li key={`${linea.nombre}-${indice}`}>
                  <span>{linea.nombre}</span>
                  <span>{formatoMoneda(linea.precio)}</span>
                </li>
              ))}
            </ul>

            <dl className="historial-totales">
              <div><dt>Subtotal</dt><dd>{formatoMoneda(servicio.subtotal)}</dd></div>
              {servicio.descuento > 0 && <div><dt>Descuento</dt><dd>-{formatoMoneda(servicio.descuento)}</dd></div>}
              <div className="historial-total"><dt><Receipt size={15} aria-hidden="true" /> Total</dt><dd>{formatoMoneda(servicio.total)}</dd></div>
            </dl>
          </>
        )}
      </div>
    </Modal>
  );
}

function TarjetaServicio({ servicio, onAbrir }) {
  return (
    <li className="historial-item">
      <button type="button" className="historial-tarjeta" onClick={() => onAbrir(servicio.id)}>
        <div className="historial-tarjeta-cabecera">
          <span className="placa placa-azul">{servicio.placa}</span>
          <span className="historial-fecha">{formatoFechaHora(servicio.fecha)}</span>
        </div>
        <p className="historial-lavado">{servicio.tipoLavado}</p>
        <p className="historial-sede"><MapPin size={14} aria-hidden="true" /> {servicio.sede || 'Sede'}</p>
        <div className="historial-tarjeta-pie">
          <span className="historial-total-texto">{formatoMoneda(servicio.total)}</span>
          <span className="historial-ver">Ver detalle <ChevronRight size={16} aria-hidden="true" /></span>
        </div>
      </button>
    </li>
  );
}

export default function HistorialCliente() {
  const { slug } = useParams();
  const [sedeEstado, setSedeEstado] = useState({ cargando: true, sede: null, error: null });
  const [pase, setPase] = useState(() => leerPase(slug));
  const [cliente, setCliente] = useState(null);
  const [vehiculos, setVehiculos] = useState([]);
  const [placa, setPlaca] = useState('');
  const [historial, setHistorial] = useState([]);
  const [cargandoHistorial, setCargandoHistorial] = useState(false);
  const [errorHistorial, setErrorHistorial] = useState('');
  const [detalleId, setDetalleId] = useState(null);
  const [avisoSesion, setAvisoSesion] = useState('');
  const [recargas, setRecargas] = useState(0);

  // La sede del enlace (nombre, logo y colores) es pública.
  useEffect(() => {
    let vigente = true;
    setSedeEstado({ cargando: true, sede: null, error: null });
    obtenerSede(slug)
      .then((sede) => vigente && setSedeEstado({ cargando: false, sede, error: null }))
      .catch((error) => vigente && setSedeEstado({ cargando: false, sede: null, error }));
    return () => {
      vigente = false;
    };
  }, [slug]);

  useEffect(() => {
    if (sedeEstado.sede?.nombre) document.title = `${sedeEstado.sede.nombre} · Mi historial`;
  }, [sedeEstado.sede]);

  const vencerPase = () => {
    guardarPase(slug, null);
    setPase(null);
    setCliente(null);
    setVehiculos([]);
    setHistorial([]);
    setDetalleId(null);
    setAvisoSesion('Tu acceso venció. Verifica de nuevo tu placa y celular.');
  };

  // Con el pase cargado: vehículos (filtro) e historial. Un 401 obliga a verificar de nuevo.
  useEffect(() => {
    if (!pase) return undefined;
    let vigente = true;
    setCargandoHistorial(true);
    setErrorHistorial('');

    Promise.all([listarVehiculosCliente(pase), listarHistorialCliente(pase, { placa })])
      .then(([respuestaVehiculos, respuestaHistorial]) => {
        if (!vigente) return;
        setVehiculos(respuestaVehiculos.vehiculos ?? []);
        setCliente(respuestaHistorial.cliente ?? null);
        setHistorial(respuestaHistorial.historial ?? []);
      })
      .catch((error) => {
        if (!vigente) return;
        if (error.status === 401) {
          vencerPase();
          return;
        }
        setErrorHistorial(error.message || 'No pudimos cargar tu historial.');
      })
      .finally(() => {
        if (vigente) setCargandoHistorial(false);
      });

    return () => {
      vigente = false;
    };
  }, [pase, placa, slug, recargas]);

  const alEntrar = (datos) => {
    guardarPase(slug, datos.pase);
    setCliente(datos.cliente ?? null);
    setAvisoSesion('');
    setPlaca('');
    setPase(datos.pase);
  };

  const manejarSesionVencida = () => {
    vencerPase();
    setAvisoSesion('Tu acceso venció. Verifica de nuevo tu placa y celular.');
  };

  const { cargando: cargandoSede, sede, error: errorSede } = sedeEstado;

  return (
    <main className="seguimiento historial-cliente" style={estiloMarca(sede)}>
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
            <FormularioAcceso slug={slug} alEntrar={alEntrar} />
          </>
        ) : (
          <section className="seg-tarjeta historial-panel" aria-labelledby="historial-titulo">
            <div className="historial-cabecera">
              <div>
                <p className="historial-saludo">{cliente?.nombre ? `Hola, ${cliente.nombre}` : 'Mis servicios'}</p>
                <h1 id="historial-titulo" className="historial-titulo">Historial de servicios</h1>
                <p className="historial-subtitulo">{sede?.nombre ? `Servicios entregados en ${sede.nombre}.` : 'Tus servicios entregados.'}</p>
              </div>
              <Link className="historial-volver" to={`/s/${encodeURIComponent(slug)}`}>
                <ArrowLeft size={16} aria-hidden="true" /> Inicio
              </Link>
            </div>

            {vehiculos.length > 1 && (
              <div className="campo historial-filtro">
                <label htmlFor="historial-placa">Filtrar por placa</label>
                <select id="historial-placa" value={placa} onChange={(e) => setPlaca(e.target.value)} disabled={cargandoHistorial}>
                  <option value="">Todos mis vehículos</option>
                  {vehiculos.map((v) => <option key={v.id} value={v.placa}>{v.placa}</option>)}
                </select>
              </div>
            )}

            {errorHistorial && (
              <div className="aviso aviso-error" role="alert">
                <p>{errorHistorial}</p>
                <button type="button" className="boton secundario boton-pequeno" onClick={() => setRecargas((n) => n + 1)}>Reintentar</button>
              </div>
            )}

            {cargandoHistorial && historial.length === 0 ? (
              <Cargando texto="Cargando tus servicios…" className="historial-cargando" />
            ) : !errorHistorial && historial.length === 0 ? (
              <div className="aviso aviso-info historial-vacio" role="status">
                <Info size={20} aria-hidden="true" />
                <div>
                  <p className="historial-vacio-titulo">
                    {placa ? `Todavía no tienes servicios entregados para la placa ${placa}.` : 'Todavía no tienes servicios entregados.'}
                  </p>
                  <p>Cuando tu vehículo se entregue, aparecerá aquí con los servicios realizados.</p>
                </div>
              </div>
            ) : (
              <ul className="historial-lista">
                {historial.map((servicio) => (
                  <TarjetaServicio key={servicio.id} servicio={servicio} onAbrir={setDetalleId} />
                ))}
              </ul>
            )}
          </section>
        )}
      </div>

      {detalleId && (
        <DetalleServicio
          pase={pase}
          ordenId={detalleId}
          onCerrar={() => setDetalleId(null)}
          onVencer={manejarSesionVencida}
        />
      )}

      <footer className="seg-pie">
        Con tecnología de <MarcaZaru tamano={16} gota={false} />
      </footer>
    </main>
  );
}
