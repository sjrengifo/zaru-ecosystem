// HU-30 CA3 — "Dejar de recibir" desde el enlace de un correo, sin iniciar sesión.
//
// /baja/:token
//   El cliente ve qué comunicaciones va a dejar de recibir y de qué establecimiento, confirma con un
//   botón y la autorización queda retirada en ese momento (el criterio pide menos de 24 horas).
//   Confirmar es un paso explícito: los filtros antispam abren los enlaces de los correos por su cuenta
//   y eso no debe dar de baja a nadie.
//
// Es una página pública: no muestra datos personales del cliente.
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BellOff, CircleCheck } from 'lucide-react';
import Cargando from '../components/Cargando.jsx';
import MarcaZaru from '../components/MarcaZaru.jsx';
import { formatoFechaHora } from '../lib/formato.js';
import { confirmarBaja, consultarBaja } from '../services/baja.js';
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

const DESCRIPCION = {
  notificaciones_servicio: 'los correos que te avisan cuándo ingresa y cuándo está listo tu vehículo',
  comerciales: 'las promociones y ofertas por correo',
};

function Contenido({ token, datos, onConfirmado }) {
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const { sede, tipo, autorizado, revocadaAt } = datos;
  const queDejas = DESCRIPCION[tipo] ?? 'estas comunicaciones';

  async function confirmar() {
    setEnviando(true);
    setError('');
    try {
      onConfirmado(await confirmarBaja(token));
    } catch (e) {
      setError(e.status === 429 ? e.message : 'No pudimos registrar tu solicitud. Inténtalo de nuevo en unos minutos.');
    } finally {
      setEnviando(false);
    }
  }

  if (revocadaAt) {
    return (
      <section className="seg-tarjeta seg-vacio baja-tarjeta" aria-live="polite">
        <CircleCheck className="baja-icono baja-icono-ok" size={44} aria-hidden="true" />
        <h1>Listo, ya no recibirás {datos.nombreTipo.toLowerCase()}</h1>
        <p>
          Retiramos tu autorización para {queDejas} de {sede.nombre}. Quedó registrado el{' '}
          <strong>
            <time dateTime={revocadaAt}>{formatoFechaHora(revocadaAt)}</time>
          </strong>
          .
        </p>
        <p className="baja-nota">Si cambias de opinión, pídelo en el establecimiento y lo activamos de nuevo.</p>
      </section>
    );
  }

  if (!autorizado) {
    return (
      <section className="seg-tarjeta seg-vacio baja-tarjeta">
        <BellOff className="baja-icono" size={44} aria-hidden="true" />
        <h1>Ya no recibes {datos.nombreTipo.toLowerCase()}</h1>
        <p>
          Tu autorización para {queDejas} de {sede.nombre} ya estaba retirada. No tienes que hacer nada más.
        </p>
      </section>
    );
  }

  return (
    <section className="seg-tarjeta seg-vacio baja-tarjeta" aria-labelledby="baja-titulo">
      <BellOff className="baja-icono" size={44} aria-hidden="true" />
      <h1 id="baja-titulo">¿Dejar de recibir {datos.nombreTipo.toLowerCase()}?</h1>
      <p>
        Vas a retirar tu autorización para {queDejas} de <strong>{sede.nombre}</strong>. El cambio es inmediato.
      </p>
      {error && (
        <p className="seg-error-campo" role="alert">
          {error}
        </p>
      )}
      <button type="button" className="boton boton-ancho" onClick={confirmar} disabled={enviando}>
        {enviando ? 'Registrando…' : 'Sí, dejar de recibirlos'}
      </button>
      <p className="baja-nota">
        Tus datos se tratan según la <Link to="/politica-datos">política de tratamiento de datos</Link> (Ley 1581 de 2012).
      </p>
    </section>
  );
}

export default function BajaNotificaciones() {
  const { token } = useParams();
  const [estado, setEstado] = useState({ cargando: true, datos: null, error: null });

  useEffect(() => {
    let vigente = true;
    consultarBaja(token)
      .then((datos) => vigente && setEstado({ cargando: false, datos, error: null }))
      .catch((error) => vigente && setEstado({ cargando: false, datos: null, error }));
    return () => {
      vigente = false;
    };
  }, [token]);

  useEffect(() => {
    document.title = 'Dejar de recibir correos';
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
            <h1>Este enlace no está disponible</h1>
            <p>{error.message}. Si quieres dejar de recibir correos, pídelo en el establecimiento.</p>
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
