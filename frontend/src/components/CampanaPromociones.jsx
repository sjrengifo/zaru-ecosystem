// HU-35 (ZARU-24) — Envío de promociones segmentadas desde el panel del administrador.
//
// Cinco pasos:
//   1. elegir una promoción vigente (CA1);
//   2. armar el segmento con días sin visita, servicios usados y tipo de vehículo (CA1);
//   3. previsualizar el total y las exclusiones que calcula la API (CA2, CA3);
//   4. elegir la hora, avisando si la API la moverá a las 7:00 a. m. (CA4);
//   5. confirmar con una clave de idempotencia para no duplicar la campaña.
// Debajo se muestra el historial de campañas de la sede. La API vuelve a validar autorización,
// límite semanal y horario al confirmar y al enviar: esta pantalla nunca decide por su cuenta.
import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api.js';
import { crearCampana, estimarCampana, listarCampanas } from '../services/campanas.js';
import {
  DIAS_SIN_VISITA,
  ESTADOS_CAMPANA,
  aFechaBogota,
  ajustarHorarioBogota,
  nuevaClaveIdempotencia,
  resumenExclusiones,
  textoDias,
  valorProgramacionPorDefecto,
} from '../lib/campanas.js';
import { formatoDia, formatoFechaHora, formatoMoneda } from '../lib/formato.js';
import Cargando from './Cargando.jsx';
import MensajeError from './MensajeError.jsx';
import Notificacion from './Notificacion.jsx';
import '../styles/campanas.css';

const PASOS = ['Promoción', 'Segmento', 'Previsualización', 'Horario', 'Confirmar'];

const VACIO = {
  promocionId: '',
  diasSinVisita: 60,
  servicioIds: [],
  tiposVehiculo: [],
};

function exclusionesDe(campana) {
  const omitidos = campana.omitidos ?? {};
  return resumenExclusiones(Object.keys(omitidos).length > 0 ? omitidos : campana.exclusiones ?? {});
}

export default function CampanaPromociones({ onCreada }) {
  const [paso, setPaso] = useState(0);
  const [catalogo, setCatalogo] = useState({ promociones: [], servicios: [], tipos: [], cargando: true, error: '' });
  const [datos, setDatos] = useState(() => ({ ...VACIO, programadaPara: valorProgramacionPorDefecto() }));
  const [tipoNuevo, setTipoNuevo] = useState('');
  const [estimacion, setEstimacion] = useState(null);
  const [estimando, setEstimando] = useState(false);
  const [recalculo, setRecalculo] = useState(0);
  const [errorEstimacion, setErrorEstimacion] = useState('');
  const [error, setError] = useState('');
  const [creando, setCreando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [clave, setClave] = useState(nuevaClaveIdempotencia);
  const [historial, setHistorial] = useState({ campanas: [], paginacion: null });
  const [cargandoHistorial, setCargandoHistorial] = useState(true);
  const [errorHistorial, setErrorHistorial] = useState('');
  const [paginaHistorial, setPaginaHistorial] = useState(1);

  useEffect(() => {
    let vigente = true;
    Promise.all([api.get('/promociones?estado=vigentes'), api.get('/servicios'), api.get('/vehiculos')])
      .then(([promociones, servicios, vehiculos]) => {
        if (!vigente) return;
        const tipos = [...new Set((Array.isArray(vehiculos) ? vehiculos : []).map((v) => String(v.tipo ?? '').trim()).filter(Boolean))];
        setCatalogo({
          promociones: Array.isArray(promociones) ? promociones : [],
          servicios: (Array.isArray(servicios) ? servicios : []).filter((s) => s.activo !== false),
          tipos: tipos.sort((a, b) => a.localeCompare(b, 'es')),
          cargando: false,
          error: '',
        });
      })
      .catch((e) => vigente && setCatalogo((c) => ({ ...c, cargando: false, error: e.message })));
    return () => {
      vigente = false;
    };
  }, []);

  const cargarHistorial = useCallback(async (pagina = 1) => {
    setCargandoHistorial(true);
    try {
      const datosHistorial = await listarCampanas(pagina);
      setHistorial({
        campanas: Array.isArray(datosHistorial?.campanas) ? datosHistorial.campanas : [],
        paginacion: datosHistorial?.paginacion ?? null,
      });
      setPaginaHistorial(pagina);
      setErrorHistorial('');
    } catch (e) {
      setErrorHistorial(e.message);
    } finally {
      setCargandoHistorial(false);
    }
  }, []);

  useEffect(() => {
    cargarHistorial(1);
  }, [cargarHistorial]);

  // La previsualización se pide a la API al entrar al paso 3 o al pedir "Recalcular". Es la API la
  // que aplica autorización comercial, límite semanal y canal; aquí solo se muestra el resultado.
  useEffect(() => {
    if (paso !== 2) return undefined;
    let vigente = true;
    setEstimando(true);
    setErrorEstimacion('');
    estimarCampana({
      promocionId: datos.promocionId,
      segmento: {
        diasSinVisita: Number(datos.diasSinVisita),
        servicioIds: datos.servicioIds,
        tiposVehiculo: datos.tiposVehiculo,
      },
    })
      .then((respuesta) => vigente && setEstimacion(respuesta))
      .catch((e) => {
        if (!vigente) return;
        setEstimacion(null);
        setErrorEstimacion(e.message);
      })
      .finally(() => vigente && setEstimando(false));
    return () => {
      vigente = false;
    };
    // `datos` solo puede cambiar en los pasos 1 y 2; al volver a este paso se recalcula.
  }, [paso, recalculo]);

  const promocion = catalogo.promociones.find((p) => p.id === datos.promocionId);
  const tiposDisponibles = [...new Set([...catalogo.tipos, ...datos.tiposVehiculo])].sort((a, b) => a.localeCompare(b, 'es'));
  const fechaSolicitada = aFechaBogota(datos.programadaPara);
  const horario = ajustarHorarioBogota(fechaSolicitada);

  function cambiar(campo, valor) {
    setDatos((d) => ({ ...d, [campo]: valor }));
    setError('');
  }

  function alternar(claveLista, id) {
    const lista = datos[claveLista];
    cambiar(claveLista, lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id]);
  }

  function agregarTipo() {
    const tipo = tipoNuevo.trim();
    if (!tipo) return;
    const existente = tiposDisponibles.find((t) => t.toLowerCase() === tipo.toLowerCase());
    const valor = existente ?? tipo;
    if (!datos.tiposVehiculo.includes(valor)) cambiar('tiposVehiculo', [...datos.tiposVehiculo, valor]);
    setTipoNuevo('');
  }

  function continuar() {
    if (paso === 0 && !datos.promocionId) {
      setError('Elige la promoción que quieres enviar.');
      return;
    }
    if (paso === 2 && (!estimacion || estimacion.total === 0)) {
      setError('Ajusta el segmento: no hay destinatarios para esta campaña.');
      return;
    }
    if (paso === 3 && !fechaSolicitada) {
      setError('Elige una fecha y hora válidas.');
      return;
    }
    setError('');
    setPaso((p) => Math.min(PASOS.length - 1, p + 1));
  }

  function volver() {
    setError('');
    setPaso((p) => Math.max(0, p - 1));
  }

  async function confirmar() {
    if (!fechaSolicitada || !horario) {
      setError('Elige una fecha y hora válidas.');
      return;
    }
    setCreando(true);
    setError('');
    try {
      const campana = await crearCampana(
        {
          promocionId: datos.promocionId,
          segmento: {
            diasSinVisita: Number(datos.diasSinVisita),
            servicioIds: datos.servicioIds,
            tiposVehiculo: datos.tiposVehiculo,
          },
          programadaPara: fechaSolicitada.toISOString(),
        },
        clave,
      );
      setResultado(campana);
      setClave(nuevaClaveIdempotencia());
      setPaso(0);
      setDatos({ ...VACIO, programadaPara: valorProgramacionPorDefecto() });
      setEstimacion(null);
      await cargarHistorial(1);
      onCreada?.(campana);
    } catch (e) {
      setError(e.message);
    } finally {
      setCreando(false);
    }
  }

  const paginacion = historial.paginacion;

  return (
    <section className="campanas" aria-labelledby="campanas-titulo">
      <div className="encabezado">
        <div>
          <h2 id="campanas-titulo">Enviar promoción a tus clientes</h2>
          <p className="texto-suave">
            Elige una promoción vigente y el segmento. Solo se envía a quien autorizó promociones, no superó 2 en la semana y tiene correo.
          </p>
        </div>
      </div>

      <div className="notificaciones" role="status">
        {resultado && (
          <Notificacion
            titulo="Campaña programada"
            detalle={`${resultado.promocion?.nombre ?? 'Promoción'} · ${formatoFechaHora(resultado.programadaPara)} · ${resultado.totalDestinatarios} destinatarios`}
            onCerrar={() => setResultado(null)}
          />
        )}
      </div>

      {catalogo.error && <MensajeError id="campanas-catalogo">{catalogo.error}</MensajeError>}
      {error && (
        <div className="aviso aviso-error" role="alert">
          <p>{error}</p>
        </div>
      )}

      <ol className="campanas-pasos" aria-label="Pasos para enviar la campaña">
        {PASOS.map((nombre, i) => (
          <li key={nombre} className={i === paso ? 'campanas-paso actual' : i < paso ? 'campanas-paso hecho' : 'campanas-paso'} aria-current={i === paso ? 'step' : undefined}>
            <span className="campanas-paso-numero">{i + 1}</span> {nombre}
          </li>
        ))}
      </ol>

      <div className="tarjeta campanas-panel">
        {catalogo.cargando && <Cargando texto="Cargando promociones y catálogo…" />}

        {!catalogo.cargando && paso === 0 && (
          <fieldset className="grupo-opciones">
            <legend>Promoción vigente</legend>
            {catalogo.promociones.length === 0 ? (
              <p className="texto-suave">No hay promociones vigentes. Crea o activa una para poder enviarla.</p>
            ) : (
              <div className="campanas-opciones">
                {catalogo.promociones.map((p) => (
                  <label key={p.id} className="casilla campanas-opcion">
                    <input
                      type="radio"
                      name="campana-promocion"
                      value={p.id}
                      checked={datos.promocionId === p.id}
                      onChange={() => cambiar('promocionId', p.id)}
                    />
                    <span>
                      <strong>{p.nombre}</strong>
                      <span className="texto-suave">
                        {' '}
                        · {Number(p.descuento_pct)} % · {formatoDia(p.fecha_inicio)} – {formatoDia(p.fecha_fin)}
                      </span>
                      {p.servicios?.length > 0 && <span className="campanas-detalle">Servicios: {p.servicios.map((s) => s.nombre).join(', ')}</span>}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </fieldset>
        )}

        {!catalogo.cargando && paso === 1 && (
          <>
            <div className="campo">
              <label htmlFor="campana-dias">Días sin visita</label>
              <select id="campana-dias" value={datos.diasSinVisita} onChange={(e) => cambiar('diasSinVisita', Number(e.target.value))}>
                {DIAS_SIN_VISITA.map((dias) => (
                  <option key={dias} value={dias}>
                    {textoDias(dias)}
                  </option>
                ))}
              </select>
            </div>

            <fieldset className="grupo-opciones">
              <legend>
                Servicios usados <span className="texto-suave">(opcional)</span>
              </legend>
              <p className="campo-ayuda">Si no eliges ninguno, no se filtra por servicio.</p>
              {catalogo.servicios.length === 0 ? (
                <p className="texto-suave">El catálogo no tiene servicios activos.</p>
              ) : (
                <div className="campanas-opciones">
                  {catalogo.servicios.map((s) => (
                    <label key={s.id} className="casilla">
                      <input
                        type="checkbox"
                        checked={datos.servicioIds.includes(s.id)}
                        onChange={() => alternar('servicioIds', s.id)}
                      />
                      <span>
                        {s.nombre} <span className="texto-suave">· {formatoMoneda(s.precio)}</span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </fieldset>

            <fieldset className="grupo-opciones">
              <legend>
                Tipo de vehículo <span className="texto-suave">(opcional)</span>
              </legend>
              <p className="campo-ayuda">Se toman los tipos registrados en los vehículos de la sede. Si no eliges ninguno, no se filtra por tipo.</p>
              {tiposDisponibles.length > 0 && (
                <div className="campanas-opciones">
                  {tiposDisponibles.map((tipo) => (
                    <label key={tipo} className="casilla">
                      <input
                        type="checkbox"
                        checked={datos.tiposVehiculo.includes(tipo)}
                        onChange={() => alternar('tiposVehiculo', tipo)}
                      />
                      <span>{tipo}</span>
                    </label>
                  ))}
                </div>
              )}
              <div className="campanas-agregar">
                <label htmlFor="campana-tipo-nuevo" className="texto-suave">
                  Otro tipo
                </label>
                <input
                  id="campana-tipo-nuevo"
                  type="text"
                  maxLength={40}
                  value={tipoNuevo}
                  placeholder="Ej.: camioneta"
                  onChange={(e) => setTipoNuevo(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      agregarTipo();
                    }
                  }}
                />
                <button type="button" className="boton secundario boton-pequeno" onClick={agregarTipo} disabled={!tipoNuevo.trim()}>
                  Agregar tipo
                </button>
              </div>
            </fieldset>
          </>
        )}

        {!catalogo.cargando && paso === 2 && (
          <div className="campanas-preview">
            <h3>Previsualización</h3>
            {estimando && <Cargando texto="Calculando destinatarios…" />}
            {errorEstimacion && <MensajeError id="campanas-estimar">{errorEstimacion}</MensajeError>}
            {!estimando && estimacion && (
              <>
                <p className="campanas-total" aria-live="polite">
                  <strong>{estimacion.total}</strong> {estimacion.total === 1 ? 'destinatario' : 'destinatarios'} recibirán la promoción.
                </p>
                {estimacion.total === 0 && (
                  <p className="texto-suave">No hay clientes que cumplan el segmento. Ajusta los filtros o espera a que pase el límite semanal.</p>
                )}
                {resumenExclusiones(estimacion.exclusiones).length > 0 && (
                  <div className="campanas-exclusiones">
                    <h4>Se excluyen</h4>
                    <ul>
                      {resumenExclusiones(estimacion.exclusiones).map((e) => (
                        <li key={e.clave}>
                          {e.etiqueta}: <strong>{e.cantidad}</strong>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <button type="button" className="boton secundario boton-pequeno" onClick={() => setRecalculo((n) => n + 1)}>
                  Recalcular
                </button>
              </>
            )}
          </div>
        )}

        {!catalogo.cargando && paso === 3 && (
          <div className="campanas-horario">
            <div className="campo">
              <label htmlFor="campana-fecha">Fecha y hora de envío (hora de Colombia)</label>
              <input
                id="campana-fecha"
                type="datetime-local"
                value={datos.programadaPara}
                onChange={(e) => cambiar('programadaPara', e.target.value)}
              />
              <p className="campo-ayuda">Las promociones solo salen entre las 7:00 a. m. y las 8:00 p. m.</p>
            </div>
            {fechaSolicitada && horario?.ajustada && (
              <div className="aviso aviso-advertencia" role="status">
                <p>
                  La hora elegida queda fuera de la franja permitida. Se enviará el {formatoFechaHora(horario.programadaPara)}.
                </p>
              </div>
            )}
            {fechaSolicitada && horario && !horario.ajustada && (
              <p className="texto-suave">Se enviará el {formatoFechaHora(horario.programadaPara)}.</p>
            )}
          </div>
        )}

        {!catalogo.cargando && paso === 4 && (
          <div className="campanas-confirmar">
            <h3>Confirma la campaña</h3>
            <dl className="detalle">
              <dt>Promoción</dt>
              <dd>{promocion?.nombre ?? '—'}</dd>
              <dt>Segmento</dt>
              <dd>{textoDias(datos.diasSinVisita)}</dd>
              <dt>Servicios</dt>
              <dd>{datos.servicioIds.length === 0 ? 'Todos' : datos.servicioIds.map((id) => catalogo.servicios.find((s) => s.id === id)?.nombre ?? id).join(', ')}</dd>
              <dt>Tipos de vehículo</dt>
              <dd>{datos.tiposVehiculo.length === 0 ? 'Todos' : datos.tiposVehiculo.join(', ')}</dd>
              <dt>Destinatarios</dt>
              <dd>{estimacion?.total ?? 0}</dd>
              <dt>Envío</dt>
              <dd>
                {horario ? formatoFechaHora(horario.programadaPara) : '—'}
                {horario?.ajustada && <span className="campanas-ajuste"> (ajustado al horario permitido)</span>}
              </dd>
            </dl>
            {horario?.ajustada && (
              <p className="texto-suave">
                Pediste {formatoFechaHora(fechaSolicitada)}; la campaña saldrá a las 7:00 a. m. del día siguiente.
              </p>
            )}
            <button type="button" className="boton" onClick={confirmar} disabled={creando} aria-busy={creando}>
              {creando ? 'Programando…' : 'Programar campaña'}
            </button>
          </div>
        )}

        {!catalogo.cargando && paso < PASOS.length - 1 && (
          <div className="campanas-acciones">
            {paso > 0 && (
              <button type="button" className="boton secundario" onClick={volver} disabled={estimando}>
                Atrás
              </button>
            )}
            <button type="button" className="boton" onClick={continuar} disabled={estimando || (paso === 0 && catalogo.promociones.length === 0)}>
              Continuar
            </button>
          </div>
        )}
      </div>

      <section className="campanas-historial" aria-labelledby="campanas-historial-titulo">
        <h3 id="campanas-historial-titulo">Historial de campañas</h3>
        {errorHistorial && <MensajeError id="campanas-historial-error">{errorHistorial}</MensajeError>}
        {cargandoHistorial && historial.campanas.length === 0 ? (
          <Cargando texto="Cargando campañas…" />
        ) : (
          <div className="tabla-contenedor">
            <table className="tabla">
              <thead>
                <tr>
                  <th scope="col">Promoción</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Envío</th>
                  <th scope="col">Destinatarios</th>
                  <th scope="col">Exclusiones</th>
                </tr>
              </thead>
              <tbody>
                {historial.campanas.map((c) => (
                  <tr key={c.id}>
                    <td data-etiqueta="Promoción">
                      <strong>{c.promocion?.nombre ?? 'Promoción'}</strong>
                      {c.estado === 'cancelada' && c.error && <div className="error">{c.error}</div>}
                    </td>
                    <td data-etiqueta="Estado">
                      <span className={`estado-campana estado-${c.estado}`}>{ESTADOS_CAMPANA[c.estado] ?? c.estado}</span>
                    </td>
                    <td data-etiqueta="Envío">
                      {formatoFechaHora(c.programadaPara)}
                      {c.ajustada && <span className="campanas-ajuste"> (ajustado)</span>}
                    </td>
                    <td data-etiqueta="Destinatarios">{c.totalDestinatarios}</td>
                    <td data-etiqueta="Exclusiones">
                      {exclusionesDe(c).length === 0 ? '—' : exclusionesDe(c).map((e) => `${e.etiqueta}: ${e.cantidad}`).join(' · ')}
                    </td>
                  </tr>
                ))}
                {historial.campanas.length === 0 && (
                  <tr>
                    <td colSpan={5} className="tabla-vacia">
                      Aún no has enviado campañas.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        {paginacion && paginacion.totalPaginas > 1 && (
          <div className="campanas-paginacion">
            <button type="button" className="boton secundario boton-pequeno" disabled={paginaHistorial <= 1} onClick={() => cargarHistorial(paginaHistorial - 1)}>
              Anterior
            </button>
            <span className="texto-suave">
              Página {paginaHistorial} de {paginacion.totalPaginas}
            </span>
            <button
              type="button"
              className="boton secundario boton-pequeno"
              disabled={paginaHistorial >= paginacion.totalPaginas}
              onClick={() => cargarHistorial(paginaHistorial + 1)}
            >
              Siguiente
            </button>
          </div>
        )}
      </section>
    </section>
  );
}
