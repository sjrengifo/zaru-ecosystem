// HU-39 (ZARU-28) — Monitoreo de consumo de SMS y correo por plan dentro del panel de plataforma.
//
// Toda la información (cupos, consumos, porcentajes e indicadores) viene del backend: aquí solo se
// filtra, se formatea y se muestran los estados de carga, vacío y error.
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  actualizarPlanConsumo,
  listarAlertasConsumoGlobales,
  listarPlanesConsumo,
  obtenerDetalleConsumo,
  obtenerReporteConsumo,
} from '../services/consumo.js';
import {
  ETIQUETAS_DESTINATARIO_ALERTA,
  ETIQUETAS_ESTADO_ALERTA,
  ETIQUETAS_ESTADO_CONSUMO,
  FILTROS_CONSUMO,
  anchoBarra,
  claseBarra,
  etiquetaMes,
  filtrarConsumo,
  mesBogota,
  mesSiguiente,
  opcionesMes,
  pluralizar,
  textoNumero,
  textoPorcentaje,
  ultimosPeriodos,
} from '../lib/consumo.js';
import { PLANES } from '../lib/establecimientos.js';
import { fechaYHora } from '../lib/notificaciones.js';
import Cargando from './Cargando.jsx';
import MensajeError from './MensajeError.jsx';
import Modal from './Modal.jsx';
import '../styles/consumo.css';

function Indicadores({ resumen }) {
  const tarjetas = [
    { texto: 'Establecimientos con plan', valor: resumen.establecimientos },
    { texto: 'SMS consumidos', valor: textoNumero(resumen.smsConsumidos) },
    { texto: 'Correos enviados', valor: textoNumero(resumen.correosConsumidos) },
    {
      texto: `Alcanzaron el 80 % (${pluralizar(resumen.cercanosAlLimite, 'sede', 'sedes')})`,
      valor: resumen.cercanosAlLimite,
      clase: resumen.cercanosAlLimite ? 'advertencia' : '',
    },
    {
      texto: `Cupo agotado (${pluralizar(resumen.cupoAgotado, 'sede', 'sedes')})`,
      valor: resumen.cupoAgotado,
      clase: resumen.cupoAgotado ? 'agotado' : '',
    },
  ];
  return (
    <div className="consumo-tarjetas" role="group" aria-label="Resumen de consumo de la plataforma">
      {tarjetas.map((t) => (
        <div className={`consumo-tarjeta ${t.clase ?? ''}`} key={t.texto}>
          <span className="consumo-tarjeta-numero">{t.valor}</span>
          <span className="consumo-tarjeta-texto">{t.texto}</span>
        </div>
      ))}
    </div>
  );
}

function BarraConsumo({ canal, etiqueta }) {
  return (
    <div className="consumo-celda">
      <strong>{textoNumero(canal.usados)}</strong>
      <div
        className={claseBarra(canal)}
        role="progressbar"
        aria-label={etiqueta}
        aria-valuenow={Math.round(anchoBarra(canal))}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <span style={{ width: `${anchoBarra(canal)}%` }} />
      </div>
      <div className="consumo-valores">
        <span>{textoPorcentaje(canal.porcentaje)}</span>
        <span>de {textoNumero(canal.cupo)}</span>
        <span>{textoNumero(canal.restantes)} disponibles</span>
      </div>
    </div>
  );
}

function DetalleConsumo({ mes, sede, onCerrar }) {
  return (
    <Modal titulo={`Consumo de ${sede.nombre}`} onCerrar={onCerrar}>
      <div className="consumo-detalle">
        <p className="texto-suave">
          Periodo: {etiquetaMes(mes)} · Plan {sede.etiquetaPlan} · Estado: {ETIQUETAS_ESTADO_CONSUMO[sede.estado] ?? sede.estado}
        </p>
        <div className="consumo-detalle-grid">
          {['sms', 'correo'].map((canal) => (
            <section className="consumo-detalle-caja" key={canal} aria-label={`Detalle de ${canal === 'sms' ? 'SMS' : 'correos'}`}>
              <h4>{canal === 'sms' ? 'SMS' : 'Correos'}</h4>
              <dl>
                <dt>Cupo mensual</dt><dd>{textoNumero(sede[canal].cupo)}</dd>
                <dt>Consumo</dt><dd>{textoNumero(sede[canal].usados)}</dd>
                <dt>Porcentaje</dt><dd>{textoPorcentaje(sede[canal].porcentaje)}</dd>
                <dt>Disponible</dt><dd>{textoNumero(sede[canal].restantes)}</dd>
              </dl>
              <BarraConsumo canal={sede[canal]} etiqueta={`Porcentaje de ${canal === 'sms' ? 'SMS' : 'correos'} usado`} />
            </section>
          ))}
        </div>
        <section aria-label="Historial mensual">
          <h4>Historial mensual</h4>
          {ultimosPeriodos(sede.historial).length ? (
            <div className="tabla-contenedor">
              <table className="tabla consumo-historial">
                <thead><tr><th>Periodo</th><th>SMS</th><th>Correos</th><th>Push</th></tr></thead>
                <tbody>
                  {ultimosPeriodos(sede.historial).map((fila) => (
                    <tr key={fila.mes}>
                      <td>{etiquetaMes(fila.mes)}</td>
                      <td>{textoNumero(fila.sms)}</td>
                      <td>{textoNumero(fila.correo)}</td>
                      <td>{textoNumero(fila.push)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="texto-suave">No hay consumo registrado en periodos anteriores.</p>
          )}
        </section>
      </div>
    </Modal>
  );
}

function CatalogoPlanes({ planes, onGuardado }) {
  const [editando, setEditando] = useState(null);
  const [formulario, setFormulario] = useState({ cupoSmsMes: '', cupoCorreoMes: '' });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  function abrir(plan) {
    setEditando(plan.nombre);
    setFormulario({ cupoSmsMes: String(plan.cupo_sms_mes), cupoCorreoMes: plan.cupo_correo_mes === null ? '' : String(plan.cupo_correo_mes) });
    setError('');
  }

  async function guardar() {
    const cambios = { cupoSmsMes: Number(formulario.cupoSmsMes) };
    if (formulario.cupoCorreoMes.trim() !== '') cambios.cupoCorreoMes = Number(formulario.cupoCorreoMes);
    if (!Number.isInteger(cambios.cupoSmsMes) || cambios.cupoSmsMes < 0) {
      setError('El cupo de SMS debe ser un número entero mayor o igual a cero.');
      return;
    }
    if (cambios.cupoCorreoMes !== undefined && (!Number.isInteger(cambios.cupoCorreoMes) || cambios.cupoCorreoMes < 0)) {
      setError('El cupo de correos debe ser un número entero mayor o igual a cero.');
      return;
    }
    setGuardando(true);
    setError('');
    try {
      await actualizarPlanConsumo(editando, cambios);
      setEditando(null);
      await onGuardado();
    } catch (e) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className="tarjeta" aria-label="Cupos configurados por plan">
      <div className="superadmin-tabla-encabezado">
        <div>
          <h3>Cupos de los planes</h3>
          <p className="texto-suave">Configuración vigente para nuevos envíos. No altera el consumo histórico.</p>
        </div>
      </div>
      <div className="consumo-planes">
        {planes.map((plan) => (
          <div className="consumo-plan" key={plan.nombre}>
            <h4>{plan.etiqueta ?? plan.nombre}</h4>
            {editando === plan.nombre ? (
              <div>
                <label>
                  Cupo SMS mensual
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={formulario.cupoSmsMes}
                    onChange={(e) => setFormulario((f) => ({ ...f, cupoSmsMes: e.target.value }))}
                  />
                </label>
                <label>
                  Cupo correos mensual (vacío = sin límite)
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={formulario.cupoCorreoMes}
                    onChange={(e) => setFormulario((f) => ({ ...f, cupoCorreoMes: e.target.value }))}
                  />
                </label>
                {error && <p className="aviso aviso-error" role="alert">{error}</p>}
                <div className="acciones-fila">
                  <button className="boton boton-pequeno" type="button" disabled={guardando} aria-busy={guardando} onClick={guardar}>Guardar</button>
                  <button className="boton secundario boton-pequeno" type="button" disabled={guardando} onClick={() => setEditando(null)}>Cancelar</button>
                </div>
              </div>
            ) : (
              <div>
                <p className="texto-suave">SMS: {textoNumero(plan.cupo_sms_mes)} / mes</p>
                <p className="texto-suave">Correos: {textoNumero(plan.cupo_correo_mes)} / mes</p>
                <button className="boton secundario boton-pequeno" type="button" onClick={() => abrir(plan)}>Ajustar cupos</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

/** Sección de consumo insertada en el panel existente; no es una página ni una ruta new. */
export default function ConsumoPorPlan() {
  const [mes, setMes] = useState(() => mesBogota());
  const [reporte, setReporte] = useState(null);
  const [planes, setPlanes] = useState([]);
  const [alertas, setAlertas] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [buscar, setBuscar] = useState('');
  const [filtroPlan, setFiltroPlan] = useState('todos');
  const [filtroEstado, setFiltroEstado] = useState('todos');
  const [detalle, setDetalle] = useState(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      // Si falla el catálogo de planes, el reporte tampoco puede calcular cupos: se informa el error.
      const [datos, catalogo, registroAlertas] = await Promise.all([
        obtenerReporteConsumo(mes),
        listarPlanesConsumo(),
        listarAlertasConsumoGlobales(mes),
      ]);
      setReporte(datos);
      setPlanes(catalogo);
      setAlertas(registroAlertas);
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }, [mes]);

  useEffect(() => { cargar(); }, [cargar]);

  const filas = useMemo(() => filtrarConsumo(reporte?.establecimientos ?? [], {
    buscar,
    plan: filtroPlan,
    estado: filtroEstado,
  }), [reporte, buscar, filtroPlan, filtroEstado]);

  async function verDetalle(sede) {
    setCargandoDetalle(true);
    setError('');
    try {
      setDetalle(await obtenerDetalleConsumo(sede.establecimientoId, mes));
    } catch (e) {
      setError(e.message);
    } finally {
      setCargandoDetalle(false);
    }
  }

  const nombresSedes = useMemo(() => new Map(
    (reporte?.establecimientos ?? []).map((sede) => [sede.establecimientoId, sede.nombre]),
  ), [reporte]);

  const alertasVisibles = useMemo(() => {
    const texto = buscar.trim().toLocaleLowerCase('es-CO');
    return (alertas?.alertas ?? []).filter((alerta) =>
      !texto || String(nombresSedes.get(alerta.establecimientoId) ?? '').toLocaleLowerCase('es-CO').includes(texto));
  }, [alertas, buscar, nombresSedes]);

  const hayConsumo = (reporte?.resumen?.smsConsumidos ?? 0) + (reporte?.resumen?.correosConsumidos ?? 0) > 0;
  const meses = useMemo(() => opcionesMes(), []);
  const puedeAvanzar = mes < mesBogota();

  return (
    <section className="consumo-panel" id="consumo-por-plan" aria-labelledby="titulo-consumo">
      <div className="consumo-encabezado">
        <div>
          <h2 id="titulo-consumo">Consumo de notificaciones por plan</h2>
          <p className="texto-suave">SMS, correos y cupos mensuales reales de cada establecimiento.</p>
        </div>
        <div className="consumo-controles">
          <label htmlFor="periodo-consumo">Periodo</label>
          <select id="periodo-consumo" value={mes} onChange={(e) => setMes(e.target.value)}>
            {meses.map((opcion) => <option key={opcion} value={opcion}>{etiquetaMes(opcion)}</option>)}
          </select>
          <button
            className="boton secundario boton-pequeno"
            type="button"
            disabled={!puedeAvanzar}
            onClick={() => setMes(mesSiguiente(mes))}
            aria-label="Periodo siguiente"
          >
            →
          </button>
          <button className="boton secundario boton-pequeno" type="button" onClick={cargar} disabled={cargando} aria-busy={cargando}>Actualizar</button>
        </div>
      </div>

      {error && <p className="aviso aviso-error" role="alert">{error}</p>}

      {cargando && !reporte ? <Cargando texto="Cargando consumo mensual…" className="cargando-bloque" /> : (
        <>
          {reporte && <Indicadores resumen={reporte.resumen} />}

          <div className="tarjeta">
            <div className="consumo-filtros">
              <label>
                Buscar establecimiento en consumo
                <input
                  type="search"
                  placeholder="Buscar por nombre"
                  value={buscar}
                  onChange={(e) => setBuscar(e.target.value)}
                />
              </label>
              <label>
                Plan
                <select value={filtroPlan} onChange={(e) => setFiltroPlan(e.target.value)}>
                  <option value="todos">Todos los planes</option>
                  {PLANES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </label>
              <label>
                Estado de consumo
                <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
                  {FILTROS_CONSUMO.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
              </label>
            </div>

            {cargando ? <Cargando texto="Actualizando consumo…" className="cargando-bloque" /> : (
              <div className="tabla-contenedor">
                <table className="tabla tabla-consumo">
                  <thead>
                    <tr>
                      <th>Establecimiento</th><th>Plan</th><th>SMS consumidos</th>
                      <th>Cupo SMS</th><th>% SMS utilizado</th><th>Correos</th><th>Estado</th><th>Detalle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map((fila) => (
                      <tr key={fila.establecimientoId}>
                        <td data-etiqueta="Establecimiento"><strong>{fila.nombre}</strong></td>
                        <td data-etiqueta="Plan"><span className={`plan-insignia plan-${fila.plan}`}>{fila.etiquetaPlan}</span></td>
                        <td data-etiqueta="SMS consumidos">{textoNumero(fila.sms.usados)}</td>
                        <td data-etiqueta="Cupo SMS">{textoNumero(fila.sms.cupo)}</td>
                        <td data-etiqueta="% SMS utilizado"><BarraConsumo canal={fila.sms} etiqueta={`Porcentaje de SMS usado por ${fila.nombre}`} /></td>
                        <td data-etiqueta="Correos">
                          <strong>{textoNumero(fila.correo.usados)}</strong>
                          <div className="consumo-valores">
                            <span>{textoPorcentaje(fila.correo.porcentaje)}</span>
                            <span>de {textoNumero(fila.correo.cupo)}</span>
                          </div>
                        </td>
                        <td data-etiqueta="Estado">
                          <span className={`insignia-consumo insignia-${fila.estado}`}>{ETIQUETAS_ESTADO_CONSUMO[fila.estado] ?? fila.estado}</span>
                        </td>
                        <td data-etiqueta="Detalle">
                          <button className="boton secundario boton-pequeno" type="button" onClick={() => verDetalle(fila)} disabled={cargandoDetalle}>Ver detalle</button>
                        </td>
                      </tr>
                    ))}
                    {!filas.length && (
                      <tr>
                        <td colSpan="8" className="tabla-vacia">
                          {!reporte?.establecimientos?.length
                            ? 'Todavía no hay establecimientos con suscripción.'
                            : !hayConsumo
                              ? `No hay consumo registrado en ${etiquetaMes(mes)}.`
                              : 'Ningún establecimiento coincide con los filtros.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <section className="tarjeta consumo-alertas" id="alertas-consumo" aria-labelledby="titulo-alertas-consumo">
            <div className="consumo-encabezado">
              <div>
                <h3 id="titulo-alertas-consumo">Alertas del 80 % registradas</h3>
                <p className="texto-suave">
                  Entregas persistidas por establecimiento y destinatario, con el estado real del correo.
                </p>
              </div>
            </div>
            {alertas?.alertas?.length ? (
              <div className="tabla-contenedor">
                <table className="tabla tabla-consumo">
                  <thead>
                    <tr>
                      <th>Establecimiento</th><th>Periodo</th><th>Destinatario</th>
                      <th>Estado</th><th>Intentos</th><th>Fecha</th><th>Consumo al alertar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {alertasVisibles.map((alerta) => (
                      <tr key={alerta.id}>
                        <td data-etiqueta="Establecimiento">{nombresSedes.get(alerta.establecimientoId) ?? alerta.establecimientoId}</td>
                        <td data-etiqueta="Periodo">{etiquetaMes(alerta.mes)}</td>
                        <td data-etiqueta="Destinatario">{ETIQUETAS_DESTINATARIO_ALERTA[alerta.destinatarioTipo] ?? alerta.destinatarioTipo}</td>
                        <td data-etiqueta="Estado">
                          <span className={`insignia-consumo insignia-${alerta.estado === 'enviada' ? 'normal' : 'advertencia'}`}>
                            {ETIQUETAS_ESTADO_ALERTA[alerta.estado] ?? alerta.estado}
                          </span>
                        </td>
                        <td data-etiqueta="Intentos">{alerta.intentos}</td>
                        <td data-etiqueta="Fecha">{fechaYHora(alerta.enviadaAt ?? alerta.creadaAt)}</td>
                        <td data-etiqueta="Consumo al alertar">
                          {textoNumero(alerta.detalle?.consumo)} / {textoNumero(alerta.detalle?.cupo)} · {textoPorcentaje(alerta.detalle?.porcentaje)}
                          {alerta.error ? <div className="texto-suave">{alerta.error}</div> : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="texto-suave">No hay alertas registradas en el periodo consultado.</p>}
          </section>

          {planes.length > 0 && <CatalogoPlanes planes={planes} onGuardado={cargar} />}
        </>
      )}

      {detalle && <DetalleConsumo mes={mes} sede={detalle} onCerrar={() => setDetalle(null)} />}
    </section>
  );
}
