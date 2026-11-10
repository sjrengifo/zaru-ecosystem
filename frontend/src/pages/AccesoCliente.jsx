// HU-17 — Acceso a la plataforma móvil con la placa o el celular, sin contraseña.
//
// /s/:slug — el cliente llega desde el enlace o el código QR de su car wash (CA2).
//   CA1: escribe su placa o su celular y entra directo al seguimiento de su vehículo (HU-18).
//   CA3: interfaz web móvil, sin descargas ni registro.
//   CA4: si el vehículo no tiene un servicio activo, se muestra un mensaje claro.
//
// Es una página pública: no usa la sesión del panel ni muestra datos personales.
import { useEffect, useId, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, CarFront, ChevronRight, Info, Smartphone, TriangleAlert } from 'lucide-react';
import Cargando from '../components/Cargando.jsx';
import MarcaZaru from '../components/MarcaZaru.jsx';
import { buscarVehiculo, obtenerSede } from '../services/accesoCliente.js';
import { cuerpoBusqueda, errorBusqueda, formatoCelular, limpiarCelular, limpiarPlaca } from '../lib/accesoCliente.js';
import '../styles/seguimiento.css';
import '../styles/acceso-cliente.css';

const COLOR_HEX = /^#[0-9A-Fa-f]{6}$/;

/** Colores de la sede como variables CSS, igual que en el seguimiento. */
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

const MODOS = [
  { id: 'placa', texto: 'Placa', Icono: CarFront },
  { id: 'celular', texto: 'Celular', Icono: Smartphone },
];

function FormularioAcceso({ slug, sede }) {
  const navegar = useNavigate();
  const idCampo = useId();
  const campo = useRef(null);
  const [modo, setModo] = useState('placa');
  const [valor, setValor] = useState('');
  const [errorCampo, setErrorCampo] = useState('');
  const [aviso, setAviso] = useState(null); // { tipo: 'sin-servicio' | 'limite' | 'error', texto }
  const [opciones, setOpciones] = useState(null);
  const [buscando, setBuscando] = useState(false);

  const cambiarModo = (nuevo) => {
    if (nuevo === modo) return;
    setModo(nuevo);
    setValor('');
    setErrorCampo('');
    setAviso(null);
    setOpciones(null);
    requestAnimationFrame(() => campo.current?.focus());
  };

  const enviar = async (evento) => {
    evento.preventDefault();
    if (buscando) return;
    const error = errorBusqueda(modo, valor);
    setErrorCampo(error);
    setAviso(null);
    setOpciones(null);
    if (error) {
      campo.current?.focus();
      return;
    }
    setBuscando(true);
    try {
      const { resultados } = await buscarVehiculo(slug, cuerpoBusqueda(modo, valor));
      if (resultados.length === 1) {
        navegar(`/seguimiento/${resultados[0].codigo}`);
        return;
      }
      setOpciones(resultados);
    } catch (err) {
      if (err.status === 404) {
        setAviso({ tipo: 'sin-servicio', texto: err.message });
      } else if (err.status === 429) {
        setAviso({ tipo: 'limite', texto: err.message });
      } else if (err.status === 400) {
        setErrorCampo(err.detalles?.[0]?.mensaje ?? err.message);
      } else {
        setAviso({ tipo: 'error', texto: 'No pudimos conectarnos. Revisa tu conexión a internet e inténtalo de nuevo.' });
      }
    } finally {
      setBuscando(false);
    }
  };

  const esPlaca = modo === 'placa';
  const valorMostrado = esPlaca ? valor : formatoCelular(valor);

  return (
    <section className="seg-tarjeta acceso-tarjeta" aria-labelledby="acceso-titulo">
      <h1 id="acceso-titulo" className="acceso-titulo">
        Sigue tu vehículo
      </h1>
      <p className="acceso-intro">
        {sede?.nombre ? `Consulta cómo va tu lavado en ${sede.nombre}. ` : ''}
        Sin contraseña y sin descargar nada.
      </p>

      <form onSubmit={enviar} noValidate>
        <div className="acceso-modos" role="radiogroup" aria-label="¿Con qué quieres buscar?">
          {MODOS.map(({ id, texto, Icono }) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={modo === id}
              className="acceso-modo"
              onClick={() => cambiarModo(id)}
            >
              <Icono size={18} aria-hidden="true" />
              {texto}
            </button>
          ))}
        </div>

        <label htmlFor={idCampo} className="acceso-etiqueta">
          {esPlaca ? 'Placa del vehículo' : 'Número de celular'}
        </label>
        <div className={`acceso-campo ${esPlaca ? 'acceso-campo-placa' : 'acceso-campo-celular'}`}>
          {!esPlaca && <span className="acceso-prefijo" aria-hidden="true">+57</span>}
          <input
            ref={campo}
            id={idCampo}
            value={valorMostrado}
            onChange={(e) => {
              setValor(esPlaca ? limpiarPlaca(e.target.value) : limpiarCelular(e.target.value));
              setErrorCampo('');
              setAviso(null);
            }}
            inputMode={esPlaca ? 'text' : 'numeric'}
            autoComplete={esPlaca ? 'off' : 'tel-national'}
            autoCapitalize={esPlaca ? 'characters' : 'off'}
            spellCheck={false}
            enterKeyHint="search"
            placeholder={esPlaca ? 'ABC123' : '300 123 4567'}
            aria-invalid={Boolean(errorCampo)}
            aria-describedby={`${idCampo}-ayuda`}
            disabled={buscando}
          />
        </div>
        <p id={`${idCampo}-ayuda`} className={errorCampo ? 'seg-error-campo' : 'acceso-ayuda'} role={errorCampo ? 'alert' : undefined}>
          {errorCampo || (esPlaca ? 'Escríbela sin espacios ni guiones.' : 'El mismo celular que diste al registrar tu vehículo.')}
        </p>

        <button type="submit" className="boton boton-grande acceso-boton" disabled={buscando} aria-busy={buscando}>
          {buscando ? (
            <>
              <span className="spinner" aria-hidden="true" />
              Buscando…
            </>
          ) : (
            <>
              Ver mi vehículo
              <ArrowRight size={18} aria-hidden="true" />
            </>
          )}
        </button>
      </form>

      {aviso && (
        <div className={`acceso-aviso acceso-aviso-${aviso.tipo}`} role="alert">
          {aviso.tipo === 'sin-servicio' ? <Info size={20} aria-hidden="true" /> : <TriangleAlert size={20} aria-hidden="true" />}
          <div>
            <p className="acceso-aviso-titulo">{aviso.texto.replace(/\.?$/, '.')}</p>
            {aviso.tipo === 'sin-servicio' && (
              <p>
                Revisa que {esPlaca ? 'la placa' : 'el celular'} esté bien escrito o pregunta en la recepción del car wash.
              </p>
            )}
          </div>
        </div>
      )}

      {opciones && (
        <div className="acceso-opciones">
          <p className="acceso-opciones-titulo" id="acceso-opciones-titulo">
            Tienes {opciones.length} vehículos en servicio. ¿Cuál quieres ver?
          </p>
          <ul aria-labelledby="acceso-opciones-titulo">
            {opciones.map((opcion) => (
              <li key={opcion.codigo}>
                <Link className="acceso-opcion" to={`/seguimiento/${opcion.codigo}`}>
                  <span className="placa">{opcion.placa}</span>
                  <span className="acceso-opcion-texto">Ver seguimiento</span>
                  <ChevronRight size={18} aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="acceso-codigo">
        ¿Tienes un código de seguimiento? <Link to="/seguimiento">Escríbelo aquí</Link>
      </p>
    </section>
  );
}

export default function AccesoCliente() {
  const { slug } = useParams();
  const [estado, setEstado] = useState({ cargando: true, sede: null, error: null });

  useEffect(() => {
    let vigente = true;
    setEstado({ cargando: true, sede: null, error: null });
    obtenerSede(slug)
      .then((sede) => vigente && setEstado({ cargando: false, sede, error: null }))
      .catch((error) => vigente && setEstado({ cargando: false, sede: null, error }));
    return () => {
      vigente = false;
    };
  }, [slug]);

  useEffect(() => {
    if (estado.sede?.nombre) document.title = `${estado.sede.nombre} · Sigue tu vehículo`;
  }, [estado.sede]);

  const { cargando, sede, error } = estado;

  return (
    <main className="seguimiento acceso" style={estiloMarca(sede)}>
      <div className="seg-contenido">
        <Encabezado sede={sede} />
        {cargando ? (
          <Cargando texto="Cargando…" className="seg-cargando" />
        ) : error?.status === 404 ? (
          <section className="seg-tarjeta seg-vacio">
            <h1>Este enlace no está disponible</h1>
            <p>No encontramos un car wash activo con esta dirección. Revisa el enlace o el código QR que te dieron.</p>
            <Link className="boton boton-enlace" to="/seguimiento">
              Tengo un código de seguimiento
            </Link>
          </section>
        ) : error ? (
          <section className="seg-tarjeta seg-vacio">
            <h1>No pudimos cargar la página</h1>
            <p>Revisa tu conexión a internet e inténtalo de nuevo.</p>
            <button type="button" className="boton" onClick={() => window.location.reload()}>
              Reintentar
            </button>
          </section>
        ) : (
          <FormularioAcceso slug={slug} sede={sede} />
        )}
      </div>
      <footer className="seg-pie">
        Con tecnología de <MarcaZaru tamano={16} gota={false} />
      </footer>
    </main>
  );
}
