// RF-F5-11 / RF-F5-12 — Acceso del cliente final con un código de un solo uso por SMS.
// Paso 1: el cliente escribe su celular y le llega un código de 6 dígitos por SMS y, si tiene correo
//         registrado, también por correo.
// Paso 2: escribe el código y recibe el pase de 30 días con el que la app abre el historial, el centro
//         de notificaciones y las preferencias.
import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, KeyRound, MessageSquareText, TriangleAlert } from 'lucide-react';
import { errorBusqueda, formatoCelular, limpiarCelular } from '../lib/accesoCliente.js';
import { solicitarCodigoAcceso, verificarCodigoAcceso } from '../services/historialCliente.js';

const limpiarCodigo = (valor) => String(valor ?? '').replace(/\D/g, '').slice(0, 6);
const ERROR_CONEXION = 'No pudimos conectarnos. Revisa tu conexión e inténtalo de nuevo.';

export default function FormularioPase({
  slug,
  alEntrar,
  titulo = 'Mi historial de servicios',
  intro = 'Escribe el celular con el que te registraste en el car wash. Te enviaremos un código para entrar.',
}) {
  const idBase = useId();
  const campoCodigo = useRef(null);
  const [paso, setPaso] = useState('celular'); // 'celular' | 'codigo'
  const [celular, setCelular] = useState('');
  const [codigo, setCodigo] = useState('');
  const [enmascarado, setEnmascarado] = useState('');
  const [errorCampo, setErrorCampo] = useState('');
  const [aviso, setAviso] = useState(null); // { tipo: 'limite' | 'error' | 'info', texto }
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (paso === 'codigo') campoCodigo.current?.focus();
  }, [paso]);

  const avisoDeError = (err) => {
    if (err.status === 429) return { tipo: 'limite', texto: err.message };
    if (err.status === 400) return null;
    if (err.status === 401) return { tipo: 'error', texto: err.message };
    return { tipo: 'error', texto: err.status === 500 ? err.message : ERROR_CONEXION };
  };

  const pedirCodigo = async (evento) => {
    evento?.preventDefault();
    if (enviando) return;
    const error = errorBusqueda('celular', celular);
    setErrorCampo(error);
    setAviso(null);
    if (error) return;
    setEnviando(true);
    try {
      const datos = await solicitarCodigoAcceso(slug, { celular: limpiarCelular(celular) });
      setEnmascarado(datos.celular ?? formatoCelular(celular));
      setCodigo('');
      setPaso('codigo');
      if (evento === undefined) setAviso({ tipo: 'info', texto: 'Te enviamos un código nuevo' });
    } catch (err) {
      if (err.status === 400) setErrorCampo(err.detalles?.find((d) => d.campo === 'celular')?.mensaje ?? err.message);
      setAviso(avisoDeError(err));
    } finally {
      setEnviando(false);
    }
  };

  const validarCodigo = async (evento) => {
    evento.preventDefault();
    if (enviando) return;
    const error = codigo.length === 6 ? '' : 'Escribe los 6 dígitos del código.';
    setErrorCampo(error);
    setAviso(null);
    if (error) return;
    setEnviando(true);
    try {
      alEntrar(await verificarCodigoAcceso(slug, { celular: limpiarCelular(celular), codigo }));
    } catch (err) {
      if (err.status === 400) setErrorCampo(err.detalles?.find((d) => d.campo === 'codigo')?.mensaje ?? err.message);
      setAviso(avisoDeError(err));
      setCodigo('');
      campoCodigo.current?.focus();
    } finally {
      setEnviando(false);
    }
  };

  const cambiarCelular = () => {
    setPaso('celular');
    setCodigo('');
    setErrorCampo('');
    setAviso(null);
  };

  const idAyuda = `${idBase}-ayuda`;
  const ayuda = (texto) => (
    <p id={idAyuda} className={errorCampo ? 'seg-error-campo' : 'acceso-ayuda'} role={errorCampo ? 'alert' : undefined}>
      {errorCampo || texto}
    </p>
  );
  const botonEnviar = (texto, Icono) => (
    <button type="submit" className="boton boton-grande acceso-boton" disabled={enviando} aria-busy={enviando}>
      {enviando ? (
        <>
          <span className="spinner" aria-hidden="true" />
          {paso === 'celular' ? 'Enviando…' : 'Verificando…'}
        </>
      ) : (
        <>
          {texto}
          <Icono size={18} aria-hidden="true" />
        </>
      )}
    </button>
  );

  return (
    <section className="seg-tarjeta acceso-tarjeta" aria-labelledby={`${idBase}-titulo`}>
      <h1 id={`${idBase}-titulo`} className="acceso-titulo">{titulo}</h1>

      {paso === 'celular' ? (
        <>
          <p className="acceso-intro">{intro}</p>
          <form onSubmit={pedirCodigo} noValidate>
            <label htmlFor={`${idBase}-celular`} className="acceso-etiqueta">Número de celular</label>
            <div className="acceso-campo acceso-campo-celular">
              <span className="acceso-prefijo" aria-hidden="true">+57</span>
              <input
                id={`${idBase}-celular`}
                value={formatoCelular(celular)}
                onChange={(e) => {
                  setCelular(limpiarCelular(e.target.value));
                  setErrorCampo('');
                  setAviso(null);
                }}
                inputMode="numeric"
                autoComplete="tel-national"
                placeholder="300 123 4567"
                aria-invalid={Boolean(errorCampo)}
                aria-describedby={idAyuda}
                disabled={enviando}
              />
            </div>
            {ayuda('El mismo celular que diste al registrar tu vehículo.')}
            {botonEnviar('Enviarme el código', MessageSquareText)}
          </form>
        </>
      ) : (
        <>
          <p className="acceso-intro" role="status">
            Si <strong>{enmascarado}</strong> está registrado en esta sede, te enviamos un código de 6 dígitos por SMS
            y a tu correo, si lo tienes registrado. Vence en 5 minutos.
          </p>
          <form onSubmit={validarCodigo} noValidate>
            <label htmlFor={`${idBase}-codigo`} className="acceso-etiqueta">Código de 6 dígitos</label>
            <div className="acceso-campo acceso-campo-placa">
              <input
                ref={campoCodigo}
                id={`${idBase}-codigo`}
                value={codigo}
                onChange={(e) => {
                  setCodigo(limpiarCodigo(e.target.value));
                  setErrorCampo('');
                  setAviso(null);
                }}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                aria-invalid={Boolean(errorCampo)}
                aria-describedby={idAyuda}
                disabled={enviando}
              />
            </div>
            {ayuda('No lo compartas con nadie.')}
            {botonEnviar('Entrar', KeyRound)}
          </form>
          <p className="acceso-codigo">
            <button type="button" className="acceso-enlace" onClick={() => pedirCodigo()} disabled={enviando}>
              Enviar otro código
            </button>
            {' · '}
            <button type="button" className="acceso-enlace" onClick={cambiarCelular} disabled={enviando}>
              Cambiar celular
            </button>
          </p>
        </>
      )}

      {aviso && (
        <div className={`acceso-aviso acceso-aviso-${aviso.tipo === 'info' ? 'sin-servicio' : aviso.tipo}`} role="alert">
          <TriangleAlert size={20} aria-hidden="true" />
          <p className="acceso-aviso-titulo">{aviso.texto.replace(/\.?$/, '.')}</p>
        </div>
      )}

      <p className="acceso-codigo">
        <Link to={`/s/${encodeURIComponent(slug)}`}>
          <ArrowLeft size={14} aria-hidden="true" /> Volver al inicio
        </Link>
      </p>
    </section>
  );
}
