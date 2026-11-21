// HU-29 — Selección del canal de notificación preferido, en la app del cliente final.
//
// /s/:slug/preferencias. El cliente entra con el mismo pase del historial (código por SMS, HU-59).
//   CA1: muestra los canales push, sms y correo con su estado actual (activo/inactivo).
//   CA2: el sms se activa directo con el celular registrado, que el cliente ya validó al entrar con el
//        código de HU-59. Solo si quiere usar otro número lo valida con un código de 6 dígitos.
//   CA3: si desactiva todos los canales, le advierte que no recibirá avisos y pide confirmar.
//   CA4: al guardar, las siguientes notificaciones salen solo por los canales activos.
import { useEffect, useId, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Bell, CircleCheck, LogOut, Mail, MessageSquare, Smartphone, TriangleAlert } from 'lucide-react';
import Cargando from '../components/Cargando.jsx';
import FormularioPase from '../components/FormularioPase.jsx';
import MarcaZaru from '../components/MarcaZaru.jsx';
import { formatoCelular, limpiarCelular } from '../lib/accesoCliente.js';
import {
  NOMBRE_CANAL,
  casillasDe,
  detalleCanal,
  hayCambios,
  limpiarCodigo,
  puedeActivar,
  segundosParaReenvio,
  sinCanales,
  textoEstado,
} from '../lib/preferenciasCanal.js';
import { obtenerSede } from '../services/accesoCliente.js';
import { guardarPase, leerPase } from '../services/historialCliente.js';
import {
  guardarPreferencias,
  obtenerPreferencias,
  solicitarCodigoCelular,
  verificarCodigoCelular,
} from '../services/preferenciasCliente.js';
import '../styles/seguimiento.css';
import '../styles/acceso-cliente.css';
import '../styles/historial-cliente.css';
import '../styles/notificaciones-cliente.css';
import '../styles/preferencias-notificacion.css';

const COLOR_HEX = /^#[0-9A-Fa-f]{6}$/;
const AVISO_VENCIDO = 'Tu sesión venció. Entra de nuevo con el código que te enviamos por SMS.';
const ICONOS = { push: Bell, sms: MessageSquare, correo: Mail };

const estiloMarca = (sede) => {
  const estilo = {};
  if (COLOR_HEX.test(sede?.colorPrimario ?? '')) estilo['--color-primario'] = sede.colorPrimario;
  if (COLOR_HEX.test(sede?.colorSecundario ?? '')) estilo['--color-secundario'] = sede.colorSecundario;
  return estilo;
};

const mensajeDe = (err) => err?.detalles?.[0]?.mensaje || err?.message || 'Algo salió mal. Inténtalo de nuevo.';

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

/**
 * CA2: validación de un celular distinto al registrado. Paso 1 recibe el número y envía el código;
 * paso 2 lo valida. Sin `celularRegistrado` va directo al número nuevo.
 */
function VerificacionCelular({ celularRegistrado, alEnviar, alValidar, alCancelar }) {
  const id = useId();
  const [paso, setPaso] = useState('celular');
  const [usarOtro, setUsarOtro] = useState(!celularRegistrado);
  const [otro, setOtro] = useState('');
  const [codigo, setCodigo] = useState('');
  const [envio, setEnvio] = useState(null); // { celular, reenvioEn }
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [ahora, setAhora] = useState(Date.now());

  useEffect(() => {
    if (paso !== 'codigo') return undefined;
    const temporizador = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(temporizador);
  }, [paso]);

  const enviarCodigo = async (evento) => {
    evento?.preventDefault();
    if (ocupado) return;
    const celular = usarOtro ? limpiarCelular(otro) : undefined;
    if (usarOtro && celular.length !== 10) {
      setError('Escribe tu celular de 10 dígitos, por ejemplo 300 123 4567.');
      return;
    }
    setOcupado(true);
    setError('');
    try {
      const datos = await alEnviar(celular);
      setEnvio({ celular: datos.celular, reenvioEn: datos.reenvioEn });
      setCodigo('');
      setAhora(Date.now());
      setPaso('codigo');
    } catch (err) {
      setError(mensajeDe(err));
    } finally {
      setOcupado(false);
    }
  };

  const validar = async (evento) => {
    evento.preventDefault();
    if (ocupado) return;
    if (codigo.length !== 6) {
      setError('El código tiene 6 dígitos.');
      return;
    }
    setOcupado(true);
    setError('');
    try {
      await alValidar(codigo);
    } catch (err) {
      setError(mensajeDe(err));
      setOcupado(false);
    }
  };

  const faltan = envio ? segundosParaReenvio(envio.reenvioEn, ahora) : 0;

  return (
    <section className="pref-verificacion" aria-labelledby={`${id}-titulo`}>
      <h2 id={`${id}-titulo`} className="pref-verificacion-titulo">Recibir los SMS en otro número</h2>

      {paso === 'celular' ? (
        <form onSubmit={enviarCodigo} noValidate>
          <p className="pref-ayuda">Te enviaremos un código de 6 dígitos por mensaje de texto.</p>
          {celularRegistrado && (
            <div className="pref-opciones" role="radiogroup" aria-label="Celular para el SMS">
              <label className="pref-opcion">
                <input type="radio" name={`${id}-celular`} checked={!usarOtro} onChange={() => setUsarOtro(false)} />
                Mi celular registrado ({celularRegistrado})
              </label>
              <label className="pref-opcion">
                <input type="radio" name={`${id}-celular`} checked={usarOtro} onChange={() => setUsarOtro(true)} />
                Usar otro número
              </label>
            </div>
          )}
          {usarOtro && (
            <>
              <label htmlFor={`${id}-otro`} className="acceso-etiqueta">Número de celular</label>
              <div className="acceso-campo acceso-campo-celular">
                <span className="acceso-prefijo" aria-hidden="true">+57</span>
                <input
                  id={`${id}-otro`}
                  value={formatoCelular(otro)}
                  onChange={(e) => { setOtro(limpiarCelular(e.target.value)); setError(''); }}
                  inputMode="numeric"
                  autoComplete="tel-national"
                  placeholder="300 123 4567"
                  aria-invalid={Boolean(error)}
                />
              </div>
            </>
          )}
          {error && <p className="pref-error" role="alert">{error}</p>}
          <div className="pref-acciones">
            <button type="submit" className="boton" disabled={ocupado}>{ocupado ? 'Enviando…' : 'Enviar código'}</button>
            <button type="button" className="boton secundario" onClick={alCancelar}>Cancelar</button>
          </div>
        </form>
      ) : (
        <form onSubmit={validar} noValidate>
          <p className="pref-ayuda" role="status">Enviamos un código al celular {envio?.celular}. Vence en 10 minutos.</p>
          <label htmlFor={`${id}-codigo`} className="acceso-etiqueta">Código de 6 dígitos</label>
          <input
            id={`${id}-codigo`}
            className="pref-codigo"
            value={codigo}
            onChange={(e) => { setCodigo(limpiarCodigo(e.target.value)); setError(''); }}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            aria-invalid={Boolean(error)}
            autoFocus
          />
          {error && <p className="pref-error" role="alert">{error}</p>}
          <div className="pref-acciones">
            <button type="submit" className="boton" disabled={ocupado}>{ocupado ? 'Validando…' : 'Validar código'}</button>
            <button type="button" className="boton secundario" onClick={enviarCodigo} disabled={ocupado || faltan > 0}>
              {faltan > 0 ? `Reenviar en ${faltan} s` : 'Reenviar código'}
            </button>
            <button type="button" className="boton secundario" onClick={alCancelar}>Cancelar</button>
          </div>
        </form>
      )}
    </section>
  );
}

export default function PreferenciasNotificacion() {
  const { slug } = useParams();
  const [sedeEstado, setSedeEstado] = useState({ cargando: true, sede: null, error: null });
  const [pase, setPase] = useState(() => leerPase(slug));
  const [preferencias, setPreferencias] = useState(null);
  const [casillas, setCasillas] = useState({ push: false, sms: false, correo: false });
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [avisoSesion, setAvisoSesion] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [verificando, setVerificando] = useState(false);
  const [guardado, setGuardado] = useState('');
  const [recargas, setRecargas] = useState(0);

  useEffect(() => {
    let vigente = true;
    setSedeEstado({ cargando: true, sede: null, error: null });
    obtenerSede(slug)
      .then((sede) => vigente && setSedeEstado({ cargando: false, sede, error: null }))
      .catch((err) => vigente && setSedeEstado({ cargando: false, sede: null, error: err }));
    return () => { vigente = false; };
  }, [slug]);

  useEffect(() => {
    if (sedeEstado.sede?.nombre) document.title = `${sedeEstado.sede.nombre} · Preferencias de notificación`;
  }, [sedeEstado.sede]);

  const cerrarSesion = () => {
    vencerPase();
    setAvisoSesion('');
  };

  const vencerPase = () => {
    guardarPase(slug, null);
    setPase(null);
    setPreferencias(null);
    setAvisoSesion(AVISO_VENCIDO);
  };

  const aplicar = (datos) => {
    setPreferencias(datos);
    setCasillas(casillasDe(datos));
  };

  useEffect(() => {
    if (!pase) return undefined;
    let vigente = true;
    setCargando(true);
    setError('');
    obtenerPreferencias(pase)
      .then((datos) => vigente && aplicar(datos))
      .catch((err) => {
        if (!vigente) return;
        if (err.status === 401) vencerPase();
        else setError(err.message || 'No pudimos cargar tus preferencias.');
      })
      .finally(() => vigente && setCargando(false));
    return () => { vigente = false; };
  }, [pase, slug, recargas]);

  const alEntrar = (datos) => {
    guardarPase(slug, datos.pase);
    setAvisoSesion('');
    setPase(datos.pase);
  };

  const alternar = (canal) => {
    setGuardado('');
    setConfirmando(false);
    if (casillas[canal]) {
      setCasillas((actual) => ({ ...actual, [canal]: false }));
      if (canal === 'sms') setVerificando(false);
      return;
    }
    // CA2: el SMS sin celular validado abre la validación antes de activarse.
    if (canal === 'sms' && !preferencias.canales.sms.verificado) {
      setVerificando(true);
      return;
    }
    setCasillas((actual) => ({ ...actual, [canal]: true }));
  };

  const enviarCodigo = async (celular) => {
    try {
      return await solicitarCodigoCelular(pase, { celular });
    } catch (err) {
      if (err.status === 401) vencerPase();
      throw err;
    }
  };

  const validarCodigo = async (codigo) => {
    try {
      const datos = await verificarCodigoCelular(pase, codigo);
      // El celular quedó validado: se conservan las demás casillas sin guardar y se activa el SMS.
      setPreferencias(datos);
      setCasillas((actual) => ({ ...actual, sms: true }));
      setVerificando(false);
      setGuardado('');
    } catch (err) {
      if (err.status === 401) vencerPase();
      throw err;
    }
  };

  const guardar = async ({ confirmado = false } = {}) => {
    if (guardando) return;
    // CA3: sin ningún canal activo se advierte y se pide confirmar.
    if (sinCanales(casillas) && !confirmado) {
      setConfirmando(true);
      return;
    }
    setGuardando(true);
    setError('');
    try {
      const datos = await guardarPreferencias(pase, { ...casillas, ...(confirmado ? { confirmarSinCanales: true } : {}) });
      aplicar(datos);
      setConfirmando(false);
      setGuardado(datos.sinCanales
        ? 'Guardamos tu decisión: no recibirás avisos del estado de tu vehículo.'
        : `Guardamos tus preferencias. Tus próximos avisos llegarán por: ${['push', 'sms', 'correo']
          .filter((canal) => datos.canales[canal].activo).map((canal) => NOMBRE_CANAL[canal]).join(', ')}.`);
    } catch (err) {
      if (err.status === 401) { vencerPase(); return; }
      const detalle = err.detalles?.[0];
      if (detalle?.requiereConfirmacion) setConfirmando(true);
      else if (detalle?.requiere === 'verificar_celular') { setCasillas((actual) => ({ ...actual, sms: false })); setVerificando(true); }
      else setError(mensajeDe(err));
    } finally {
      setGuardando(false);
    }
  };

  const { cargando: cargandoSede, sede, error: errorSede } = sedeEstado;
  const modificado = preferencias ? hayCambios(casillas, preferencias) : false;

  return (
    <main className="seguimiento historial-cliente notificaciones-cliente preferencias-notificacion" style={estiloMarca(sede)}>
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
              titulo="Preferencias de notificación"
              intro="Escribe el celular con el que te registraste. Te enviaremos un código por SMS para elegir cómo recibir tus avisos."
            />
          </>
        ) : (
          <section className="seg-tarjeta historial-panel" aria-labelledby="preferencias-titulo">
            <div className="historial-cabecera">
              <div>
                <h1 id="preferencias-titulo" className="historial-titulo">Preferencias de notificación</h1>
                <p className="historial-subtitulo">Elige por dónde quieres recibir los avisos de tu servicio.</p>
              </div>
              <div className="historial-acciones">
                <Link className="historial-volver" to={`/s/${encodeURIComponent(slug)}/notificaciones`}>
                  <ArrowLeft size={16} aria-hidden="true" /> Notificaciones
                </Link>
                <button type="button" className="historial-volver historial-salir" onClick={cerrarSesion}>
                  <LogOut size={16} aria-hidden="true" /> Cerrar sesión
                </button>
              </div>
            </div>

            {error && (
              <div className="aviso aviso-error" role="alert">
                <p>{error}</p>
                {!preferencias && <button type="button" className="boton secundario boton-pequeno" onClick={() => setRecargas((n) => n + 1)}>Reintentar</button>}
              </div>
            )}

            {cargando && !preferencias ? (
              <Cargando texto="Cargando tus preferencias…" className="historial-cargando" />
            ) : preferencias && (
              <>
                <ul className="pref-lista">
                  {['push', 'sms', 'correo'].map((canal) => {
                    const Icono = ICONOS[canal];
                    const datos = preferencias.canales[canal];
                    const deshabilitado = !casillas[canal] && !puedeActivar(canal, preferencias);
                    return (
                      <li key={canal} className="pref-item">
                        <label className={`pref-canal${deshabilitado ? ' pref-canal-inactivo' : ''}`}>
                          <span className="pref-icono" aria-hidden="true"><Icono size={20} /></span>
                          <span className="pref-texto">
                            <span className="pref-nombre">{NOMBRE_CANAL[canal]}</span>
                            <span className="pref-detalle">{detalleCanal(canal, preferencias)}</span>
                          </span>
                          <span className={`pref-estado ${datos.activo ? 'pref-estado-activo' : ''}`}>{textoEstado(canal, preferencias)}</span>
                          <input
                            type="checkbox"
                            role="switch"
                            className="pref-interruptor"
                            checked={casillas[canal]}
                            disabled={deshabilitado}
                            onChange={() => alternar(canal)}
                            aria-label={NOMBRE_CANAL[canal]}
                          />
                        </label>
                        {canal === 'sms' && datos.disponible && !verificando && (
                          <button type="button" className="acceso-enlace pref-otro-numero" onClick={() => setVerificando(true)}>
                            Usar otro número
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>

                {verificando && (
                  <VerificacionCelular
                    celularRegistrado={null}
                    alEnviar={enviarCodigo}
                    alValidar={validarCodigo}
                    alCancelar={() => setVerificando(false)}
                  />
                )}

                {confirmando && (
                  <div className="aviso aviso-advertencia pref-confirmacion" role="alertdialog" aria-labelledby="pref-confirmar-titulo">
                    <TriangleAlert size={20} aria-hidden="true" />
                    <div>
                      <p id="pref-confirmar-titulo" className="pref-confirmacion-titulo">No recibirás avisos del estado de tu vehículo</p>
                      <p>Si desactivas todos los canales no te avisaremos cuando tu vehículo esté listo. ¿Quieres continuar?</p>
                      <div className="pref-acciones">
                        <button type="button" className="boton" disabled={guardando} onClick={() => guardar({ confirmado: true })}>Sí, no quiero avisos</button>
                        <button type="button" className="boton secundario" onClick={() => setConfirmando(false)}>Volver</button>
                      </div>
                    </div>
                  </div>
                )}

                {guardado && (
                  <div className="aviso aviso-exito" role="status">
                    <CircleCheck size={20} aria-hidden="true" />
                    <p>{guardado}</p>
                  </div>
                )}

                <div className="pref-pie">
                  <button type="button" className="boton" disabled={!modificado || guardando || verificando} onClick={() => guardar()}>
                    {guardando ? 'Guardando…' : 'Guardar preferencias'}
                  </button>
                </div>
                <p className="notif-pie">
                  <Smartphone size={14} aria-hidden="true" /> Los avisos importantes de tu servicio solo se envían por los canales que dejes activos.
                </p>
              </>
            )}
          </section>
        )}
      </div>

      <footer className="seg-pie">
        Con tecnología de <MarcaZaru tamano={16} gota={false} />
      </footer>
    </main>
  );
}
