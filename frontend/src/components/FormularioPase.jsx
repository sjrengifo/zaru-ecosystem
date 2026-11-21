// HU-23 / HU-38 — Verificación del cliente final con placa + celular (prueba de propiedad del vehículo).
// Devuelve el pase firmado de vida corta con el que la app abre el historial y el centro de notificaciones.
import { useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Info, Search, TriangleAlert } from 'lucide-react';
import { errorBusqueda, formatoCelular, limpiarCelular, limpiarPlaca } from '../lib/accesoCliente.js';
import { accederHistorial } from '../services/historialCliente.js';

export default function FormularioPase({
  slug,
  alEntrar,
  titulo = 'Mi historial de servicios',
  intro = 'Verifica tu placa y el celular con el que registraste el vehículo. Solo tú verás tus servicios.',
  textoBoton = 'Ver mis servicios',
}) {
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
    <section className="seg-tarjeta acceso-tarjeta" aria-labelledby={`${idBase}-titulo`}>
      <h1 id={`${idBase}-titulo`} className="acceso-titulo">{titulo}</h1>
      <p className="acceso-intro">{intro}</p>

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
              {textoBoton}
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
