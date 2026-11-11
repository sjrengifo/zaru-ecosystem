// HU-18 — Seguimiento en tiempo real del estado del lavado (cliente final, web móvil).
//
// /seguimiento/:codigo
//   CA1: indicador claro de la etapa actual (en cola, lavado iniciado, secado, listo, entregado)
//        con la línea de tiempo (HU-19), el vehículo, los servicios y el total, con la marca de la sede.
//   CA2: la pantalla se actualiza sola cuando el operario cambia el estado en el panel.
// /seguimiento
//   Formulario para escribir el código si el cliente no llegó desde el enlace.
//
// Es una página pública: no usa la sesión del panel ni muestra datos personales del cliente.
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Banknote,
  CarFront,
  Check,
  ChevronDown,
  CircleCheck,
  Clock,
  Droplets,
  Hourglass,
  RefreshCw,
  Search,
  Wind,
  WifiOff,
} from 'lucide-react';
import Cargando from '../components/Cargando.jsx';
import MarcaZaru from '../components/MarcaZaru.jsx';
import { useSeguimiento } from '../hooks/useSeguimiento.js';
import { formatoMoneda } from '../lib/formato.js';
import { horaBogota } from '../lib/dashboard.js';
import { anuncioEtapa, avance, normalizarCodigo, vistaEtapa } from '../lib/seguimiento.js';
import '../styles/seguimiento.css';

const ICONO_ETAPA = {
  recibido: Hourglass,
  en_lavado: Droplets,
  secado: Wind,
  listo: CircleCheck,
  entregado: CarFront,
};

const TEXTO_CONEXION = {
  conectando: 'Conectando…',
  en_vivo: 'En vivo',
  reconectando: 'Reconectando…',
  consulta: 'Se actualiza cada pocos segundos',
};

const COLOR_HEX = /^#[0-9A-Fa-f]{6}$/;

/** Colores de la sede como variables CSS (la API ya los valida; aquí se vuelve a comprobar). */
function estiloMarca(establecimiento) {
  const estilo = {};
  if (COLOR_HEX.test(establecimiento?.colorPrimario ?? '')) estilo['--color-primario'] = establecimiento.colorPrimario;
  if (COLOR_HEX.test(establecimiento?.colorSecundario ?? '')) estilo['--color-secundario'] = establecimiento.colorSecundario;
  return estilo;
}

function Encabezado({ establecimiento }) {
  return (
    <header className="seg-encabezado">
      {establecimiento?.logoUrl ? (
        <img className="seg-logo" src={establecimiento.logoUrl} alt={establecimiento.nombre} />
      ) : establecimiento?.nombre ? (
        <span className="seg-sede">{establecimiento.nombre}</span>
      ) : (
        <MarcaZaru tamano={28} gota={false} />
      )}
    </header>
  );
}

function BuscarCodigo({ codigoInvalido = '' }) {
  const navegar = useNavigate();
  const [valor, setValor] = useState(codigoInvalido);
  const [error, setError] = useState('');

  const enviar = (evento) => {
    evento.preventDefault();
    const codigo = normalizarCodigo(valor);
    if (!codigo) {
      setError('Escribe el código tal como aparece en tu correo o en el comprobante.');
      return;
    }
    navegar(`/seguimiento/${codigo}`);
  };

  return (
    <form className="seg-buscar" onSubmit={enviar} noValidate>
      <label htmlFor="seg-codigo">Código de seguimiento</label>
      <div className="seg-buscar-fila">
        <input
          id="seg-codigo"
          value={valor}
          onChange={(e) => {
            setValor(e.target.value);
            setError('');
          }}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          placeholder="Ej. 7KQ2M9XH4P"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'seg-codigo-error' : undefined}
        />
        <button type="submit" className="boton">
          <Search size={18} aria-hidden="true" />
          Consultar
        </button>
      </div>
      {error && (
        <p id="seg-codigo-error" className="seg-error-campo" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

function SinSeguimiento({ titulo, texto, codigo }) {
  return (
    <section className="seg-tarjeta seg-vacio">
      <h1>{titulo}</h1>
      <p>{texto}</p>
      <BuscarCodigo codigoInvalido={codigo} />
    </section>
  );
}

function IndicadorEtapa({ seguimiento }) {
  const Icono = ICONO_ETAPA[seguimiento.estado] ?? Hourglass;
  const porcentaje = avance(seguimiento);
  return (
    <section className={`seg-tarjeta seg-etapa seg-etapa-${seguimiento.estado}`} aria-labelledby="seg-etapa-titulo">
      <div className="seg-etapa-icono" aria-hidden="true">
        <Icono size={36} strokeWidth={1.8} />
      </div>
      <p className="seg-etapa-paso">
        Paso {seguimiento.etapa.paso} de {seguimiento.etapa.totalPasos}
      </p>
      <h1 id="seg-etapa-titulo" className="seg-etapa-titulo">
        {seguimiento.etapa.titulo}
      </h1>
      <p className="seg-etapa-descripcion">{seguimiento.etapa.descripcion}</p>
      <div
        className="seg-progreso"
        role="progressbar"
        aria-label="Avance del lavado"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={porcentaje}
      >
        <span style={{ width: `${porcentaje}%` }} />
      </div>
      {seguimiento.estado !== 'entregado' && seguimiento.estado !== 'listo' && seguimiento.entregaEstimadaAt && (
        <p className="seg-etapa-estimada">
          <Clock size={16} aria-hidden="true" />
          Entrega estimada: {horaBogota(seguimiento.entregaEstimadaAt)}
        </p>
      )}
    </section>
  );
}

/**
 * HU-19 — Línea de tiempo de las etapas del lavado.
 * CA1: todas las etapas en orden; las completadas con check, la actual resaltada y las pendientes en gris.
 * CA2: cada etapa completada muestra la hora en que terminó.
 * CA3: al entregar el vehículo todas aparecen completadas (la API ya las marca así).
 */
function LineaDeTiempo({ etapas }) {
  return (
    <section className="seg-tarjeta" aria-labelledby="seg-linea-tiempo">
      <h2 id="seg-linea-tiempo">Línea de tiempo</h2>
      <ol className="seg-pasos">
        {etapas.map((etapa) => {
          const { clase, hora, estadoLector } = vistaEtapa(etapa);
          return (
            <li key={etapa.estado} className={`seg-paso seg-paso-${clase}`} aria-current={etapa.actual ? 'step' : undefined}>
              <span className="seg-paso-marca" aria-hidden="true">
                {etapa.completada && <Check size={14} strokeWidth={3} />}
              </span>
              <span className="seg-paso-titulo">{etapa.titulo}</span>
              <span className="seg-paso-hora">
                {hora}
                <span className="solo-lectores">{` (${estadoLector})`}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function DetalleServicio({ seguimiento }) {
  const { vehiculo, servicios } = seguimiento;
  const [abierto, setAbierto] = useState(true);
  const detalle = [vehiculo.marca, vehiculo.color].filter(Boolean).join(' · ');
  return (
    <section className="seg-tarjeta" aria-labelledby="seg-detalle-titulo">
      <h2 id="seg-detalle-titulo" className="seg-detalle-titulo">
        <button
          type="button"
          className="seg-detalle-boton"
          aria-expanded={abierto}
          aria-controls="seg-detalle-contenido"
          onClick={() => setAbierto((valor) => !valor)}
        >
          Detalle del servicio
          <ChevronDown className={abierto ? 'seg-detalle-flecha seg-detalle-flecha-abierta' : 'seg-detalle-flecha'} size={18} aria-hidden="true" />
        </button>
      </h2>
      <div id="seg-detalle-contenido" className="seg-detalle-contenido" hidden={!abierto}>
        <p className="seg-vehiculo">
          {vehiculo.placa && <span className="placa placa-grande">{vehiculo.placa}</span>}
          {detalle && <span>{detalle}</span>}
        </p>
        <ul className="seg-servicios" aria-label={`Servicios asignados${vehiculo.placa ? ` al vehículo ${vehiculo.placa}` : ''}`}>
          {servicios.map((s, i) => (
            <li key={`${s.nombre}-${i}`}>
              <span className="seg-servicio-nombre">
                {s.nombre}
                {s.duracionMin > 0 && <small>{s.duracionMin} min</small>}
              </span>
              <span>{formatoMoneda(s.precio)}</span>
            </li>
          ))}
          {seguimiento.descuento > 0 && (
            <li className="seg-descuento">
              <span>Descuento</span>
              <span>−{formatoMoneda(seguimiento.descuento)}</span>
            </li>
          )}
          <li className="seg-total">
            <span>Total</span>
            <span>{formatoMoneda(seguimiento.total)}</span>
          </li>
        </ul>
        <div className="seg-nota-pago" role="note" aria-label="Forma de pago">
          <Banknote size={18} aria-hidden="true" />
          <div>
            <strong>Pago directo en el establecimiento físico</strong>
            <p>{seguimiento.notaPago}. Esta plataforma no procesa pagos en línea.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function EstadoConexion({ conexion }) {
  const enVivo = conexion === 'en_vivo';
  return (
    <p className={`seg-conexion seg-conexion-${conexion}`}>
      {conexion === 'reconectando' ? <WifiOff size={14} aria-hidden="true" /> : <span className="seg-conexion-punto" aria-hidden="true" />}
      {TEXTO_CONEXION[conexion]}
      {enVivo && <span className="solo-lectores">: la pantalla se actualiza sola cuando cambie el estado</span>}
    </p>
  );
}

function VistaSeguimiento({ codigo, onMarca }) {
  const { seguimiento, estado, conexion, reintentar } = useSeguimiento(codigo);
  const [anuncio, setAnuncio] = useState('');
  const etapaAnterior = useRef(null);

  // HU-22: los colores de la sede suben a <main> para que el fondo de la página también los use.
  const { colorPrimario, colorSecundario } = seguimiento?.establecimiento ?? {};
  useEffect(() => {
    onMarca?.({ colorPrimario, colorSecundario });
  }, [colorPrimario, colorSecundario, onMarca]);

  // Anuncia el cambio de etapa a los lectores de pantalla (no en la primera carga).
  useEffect(() => {
    if (!seguimiento) return;
    if (etapaAnterior.current && etapaAnterior.current !== seguimiento.estado) setAnuncio(anuncioEtapa(seguimiento));
    etapaAnterior.current = seguimiento.estado;
  }, [seguimiento]);

  useEffect(() => {
    if (seguimiento?.etapa) document.title = `${seguimiento.etapa.titulo} · ${seguimiento.establecimiento?.nombre ?? 'Zaru'}`;
  }, [seguimiento]);

  if (estado === 'cargando') return <Cargando texto="Consultando tu servicio…" className="seg-cargando" />;

  if (estado === 'no_encontrado') {
    return (
      <SinSeguimiento
        titulo="No encontramos ese servicio"
        texto="Revisa el código. Si tu vehículo se entregó hace más de un día, el seguimiento ya no está disponible."
        codigo={codigo}
      />
    );
  }

  if (estado === 'limite') {
    return (
      <SinSeguimiento
        titulo="Demasiados intentos"
        texto="Probaste varios códigos que no existen. Espera unos minutos e inténtalo de nuevo."
        codigo={codigo}
      />
    );
  }

  if (estado === 'error') {
    return (
      <section className="seg-tarjeta seg-vacio">
        <h1>No pudimos consultar tu servicio</h1>
        <p>Revisa tu conexión a internet e inténtalo de nuevo.</p>
        <button type="button" className="boton" onClick={reintentar}>
          <RefreshCw size={18} aria-hidden="true" />
          Reintentar
        </button>
      </section>
    );
  }

  return (
    <div className="seg-contenido" style={estiloMarca(seguimiento.establecimiento)}>
      <Encabezado establecimiento={seguimiento.establecimiento} />
      <EstadoConexion conexion={conexion} />
      <IndicadorEtapa seguimiento={seguimiento} />
      <LineaDeTiempo etapas={seguimiento.etapas} />
      <DetalleServicio seguimiento={seguimiento} />
      <p className="seg-codigo">
        Código de seguimiento: <strong>{seguimiento.codigo}</strong>
      </p>
      <div className="solo-lectores" role="status" aria-live="polite">
        {anuncio}
      </div>
    </div>
  );
}

export default function Seguimiento() {
  const { codigo: enRuta } = useParams();
  const codigo = enRuta ? normalizarCodigo(enRuta) : null;
  const [marca, setMarca] = useState(null); // HU-22: colores de la sede de la orden consultada

  return (
    <main className="seguimiento" style={codigo ? estiloMarca(marca) : undefined}>
      {codigo ? (
        <VistaSeguimiento key={codigo} codigo={codigo} onMarca={setMarca} />
      ) : (
        <div className="seg-contenido">
          <Encabezado />
          <SinSeguimiento
            titulo={enRuta ? 'Ese código no es válido' : 'Sigue tu lavado'}
            texto="Escribe el código de seguimiento que te enviamos al registrar tu vehículo."
            codigo={enRuta ?? ''}
          />
        </div>
      )}
      <footer className="seg-pie">
        Con tecnología de <MarcaZaru tamano={16} gota={false} />
      </footer>
    </main>
  );
}
