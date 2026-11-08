// HU-18 — Seguimiento en tiempo real del estado del lavado (cliente final, web móvil).
//
// /seguimiento/:codigo
//   CA1: indicador claro de la etapa actual (en cola, lavado iniciado, secado, listo, entregado)
//        con el recorrido completo, el vehículo, los servicios y el total, con la marca de la sede.
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
import { anuncioEtapa, avance, normalizarCodigo } from '../lib/seguimiento.js';
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

function Recorrido({ etapas }) {
  return (
    <section className="seg-tarjeta" aria-labelledby="seg-recorrido">
      <h2 id="seg-recorrido">Recorrido</h2>
      <ol className="seg-pasos">
        {etapas.map((etapa) => {
          const clase = etapa.actual ? 'actual' : etapa.completada ? 'hecho' : etapa.omitida ? 'omitido' : 'pendiente';
          return (
            <li key={etapa.estado} className={`seg-paso seg-paso-${clase}`} aria-current={etapa.actual ? 'step' : undefined}>
              <span className="seg-paso-marca" aria-hidden="true">
                {etapa.completada && <Check size={14} strokeWidth={3} />}
              </span>
              <span className="seg-paso-titulo">{etapa.titulo}</span>
              <span className="seg-paso-hora">
                {etapa.omitida ? 'No aplica' : etapa.at ? horaBogota(etapa.at) : ''}
                <span className="solo-lectores">
                  {etapa.actual ? ' (etapa actual)' : etapa.completada ? ' (completada)' : etapa.omitida ? '' : ' (pendiente)'}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Resumen({ seguimiento }) {
  const { vehiculo, servicios } = seguimiento;
  const detalle = [vehiculo.marca, vehiculo.color].filter(Boolean).join(' · ');
  return (
    <section className="seg-tarjeta" aria-labelledby="seg-resumen">
      <h2 id="seg-resumen">Tu servicio</h2>
      <p className="seg-vehiculo">
        {vehiculo.placa && <span className="placa placa-grande">{vehiculo.placa}</span>}
        {detalle && <span>{detalle}</span>}
      </p>
      <ul className="seg-servicios">
        {servicios.map((s, i) => (
          <li key={`${s.nombre}-${i}`}>
            <span>{s.nombre}</span>
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
      <p className="seg-nota-pago">
        <Banknote size={16} aria-hidden="true" />
        {seguimiento.notaPago}
      </p>
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

function VistaSeguimiento({ codigo }) {
  const { seguimiento, estado, conexion, reintentar } = useSeguimiento(codigo);
  const [anuncio, setAnuncio] = useState('');
  const etapaAnterior = useRef(null);

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
      <Recorrido etapas={seguimiento.etapas} />
      <Resumen seguimiento={seguimiento} />
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

  return (
    <main className="seguimiento">
      {codigo ? (
        <VistaSeguimiento key={codigo} codigo={codigo} />
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
