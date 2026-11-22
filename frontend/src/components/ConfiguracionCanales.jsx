// HU-31/HU-39 — Canales de la sede, alertas de cupo y prueba real de envío.
// Los datos vienen siempre del backend: el front no calcula cupos ni simula entregas.
import { useCallback, useEffect, useState } from 'react';
import { guardarCanales, listarCanales } from '../services/canales.js';
import { obtenerConsumoPropio } from '../services/consumo.js';
import { enviarPruebaNotificacion } from '../services/notificaciones.js';
import { activarPushAdministrador, desactivarPushAdministrador } from '../lib/pushAdmin.js';
import {
  ETIQUETAS_ESTADO_CONSUMO,
  anchoBarra,
  claseBarra,
  etiquetaMes,
  textoNumero,
  textoPorcentaje,
} from '../lib/consumo.js';
import Cargando from './Cargando.jsx';
import '../styles/canales.css';

const ETIQUETA_CANAL = { sms: 'SMS', correo: 'Correo', push: 'Push' };
const ORDEN = ['push', 'sms', 'correo'];

const ETIQUETA_RESULTADO = {
  enviado: 'Entregado',
  fallido: 'Falló el proveedor',
  sin_cupo: 'Sin cupo',
  sin_destino: 'Sin destino',
  inactivo: 'Inactivo',
  no_disponible: 'No disponible',
};

const resultadoClase = (estado) => (estado === 'enviado' ? 'canal-prueba-ok' : 'canal-prueba-fallo');

function AlertaConsumo({ consumo }) {
  if (!consumo?.sms) return null;
  if (consumo.sms.agotado) {
    return (
      <p className="aviso aviso-error" role="alert">
        Cupo de SMS agotado: {textoNumero(consumo.sms.usados)} de {textoNumero(consumo.sms.cupo)} SMS usados este mes.
        Los avisos operativos siguen saliendo por correo; el SMS se omite sin callar la notificación.
      </p>
    );
  }
  if (consumo.sms.alerta80) {
    return (
      <p className="aviso aviso-advertencia" role="alert">
        Alerta de consumo: alcanzaste el {textoPorcentaje(consumo.sms.porcentaje)} del cupo mensual de SMS
        ({textoNumero(consumo.sms.usados)} de {textoNumero(consumo.sms.cupo)}). Quedan {textoNumero(consumo.sms.restantes)} SMS.
      </p>
    );
  }
  return null;
}

function FilaConsumo({ nombre, datos, sinCupo = false }) {
  return (
    <tr>
      <td data-etiqueta="Canal"><strong>{nombre}</strong></td>
      <td data-etiqueta="Cupo mensual">{sinCupo ? 'Sin cupo (no bloquea)' : textoNumero(datos.cupo)}</td>
      <td data-etiqueta="Consumo">{textoNumero(datos.usados)}</td>
      <td data-etiqueta="Porcentaje">
        {sinCupo ? (
          '—'
        ) : (
          <div className="consumo-celda">
            <strong>{textoPorcentaje(datos.porcentaje)}</strong>
            <div className={claseBarra(datos)} role="progressbar" aria-label={`Porcentaje de ${nombre.toLowerCase()} usado`}
              aria-valuenow={Math.round(anchoBarra(datos))} aria-valuemin={0} aria-valuemax={100}>
              <span style={{ width: `${anchoBarra(datos)}%` }} />
            </div>
          </div>
        )}
      </td>
      <td data-etiqueta="Estado">
        {sinCupo ? 'Contabilizado' : ETIQUETAS_ESTADO_CONSUMO[datos.estado ?? 'normal'] ?? datos.estado}
      </td>
    </tr>
  );
}

function PanelPushAdmin({ disponible, estado, onActivar, onDesactivar }) {
  if (!disponible) return null;
  return (
    <section className="tarjeta canales-seccion" aria-labelledby="titulo-push-admin">
      <h3 id="titulo-push-admin">Push en este dispositivo</h3>
      <p className="texto-suave">
        Activa este navegador para que la prueba de envío compruebe también el canal push. El dispositivo
        queda asociado a tu usuario y a esta sede; nadie puede elegir otro destino desde el panel.
      </p>
      <div className="canales-prueba-controles">
        <button type="button" className="boton secundario" onClick={onActivar} disabled={estado.ocupado}>
          {estado.ocupado ? 'Activando…' : 'Activar push en este dispositivo'}
        </button>
        <button type="button" className="boton secundario boton-pequeno" onClick={onDesactivar} disabled={estado.ocupado}>
          Quitar push
        </button>
      </div>
      {estado.mensaje && (
        <p className={estado.error ? 'aviso aviso-error' : 'aviso aviso-exito'} role="status">{estado.mensaje}</p>
      )}
    </section>
  );
}

function PanelConsumo({ consumo, error, onReintentar }) {
  if (!error && consumo && !consumo.sms) {
    return (
      <section className="tarjeta canales-seccion" id="consumo-sede" aria-labelledby="titulo-consumo-sede">
        <h3 id="titulo-consumo-sede">Consumo de esta sede</h3>
        <p className="aviso aviso-advertencia" role="alert">
          El backend devolvió un consumo incompleto. Vuelve a intentarlo; no se mostrarán cifras inventadas.
        </p>
        <button type="button" className="boton secundario boton-pequeno" onClick={onReintentar}>Actualizar consumo</button>
      </section>
    );
  }
  return (
    <section className="tarjeta canales-seccion" id="consumo-sede" aria-labelledby="titulo-consumo-sede">
      <div className="canales-encabezado">
        <div>
          <h3 id="titulo-consumo-sede">Consumo de esta sede</h3>
          <p className="texto-suave">Cupos, consumo real y porcentaje del mes en America/Bogota.</p>
        </div>
        <button type="button" className="boton secundario boton-pequeno" onClick={onReintentar}>Actualizar consumo</button>
      </div>

      {error && <p className="aviso aviso-error" role="alert">No se pudo cargar el consumo: {error}</p>}
      {!error && !consumo && <Cargando texto="Cargando el consumo de la sede…" className="cargando-bloque" />}
      {!error && consumo && (
        <>
          <p className="canales-sede">
            <strong>{consumo.nombre}</strong> · Plan {consumo.etiquetaPlan ?? consumo.plan} · Periodo {etiquetaMes(consumo.mes)}
          </p>
          <AlertaConsumo consumo={consumo} />
          <div className="tabla-contenedor">
            <table className="tabla tabla-canales-consumo">
              <thead>
                <tr><th>Canal</th><th>Cupo mensual</th><th>Consumo</th><th>Porcentaje usado</th><th>Estado</th></tr>
              </thead>
              <tbody>
                <FilaConsumo nombre="SMS" datos={{ ...consumo.sms, estado: consumo.estado }} />
                <FilaConsumo nombre="Correos" datos={consumo.correo} />
                <FilaConsumo nombre="Push" datos={consumo.push ?? { usados: 0, cupo: null, porcentaje: null }} sinCupo />
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

function PanelPrueba({ canales, enviando, resultado, error, onEnviar }) {
  const [canal, setCanal] = useState('');
  const opciones = canales.length
    ? canales
    : ORDEN.map((nombre) => ({ canal: nombre, etiqueta: ETIQUETA_CANAL[nombre], disponible: true, activo: true }));

  return (
    <section className="tarjeta canales-seccion" aria-labelledby="titulo-prueba-canales">
      <h3 id="titulo-prueba-canales">Prueba de envío</h3>
      <p className="texto-suave">
        Se envía un mensaje real al correo, celular o dispositivo push del administrador de esta sede. Si el canal elegido falla,
        se prueba automáticamente el siguiente de la cadena push → SMS → correo. Cada intento queda registrado
        y contabilizado.
      </p>
      <div className="canales-prueba-controles">
        <label htmlFor="canal-prueba">Canal inicial</label>
        <select id="canal-prueba" value={canal} onChange={(e) => setCanal(e.target.value)} disabled={enviando}>
          <option value="">Automático (primer canal disponible)</option>
          {opciones.map((item) => (
            <option key={item.canal} value={item.canal}>
              {item.etiqueta ?? ETIQUETA_CANAL[item.canal]}{item.disponible === false ? ' · no disponible' : ''}
            </option>
          ))}
        </select>
        <button type="button" className="boton" onClick={() => onEnviar(canal || undefined)} disabled={enviando} aria-busy={enviando}>
          {enviando ? 'Enviando…' : 'Enviar prueba'}
        </button>
      </div>

      {error && <p className="aviso aviso-error" role="alert">No se pudo enviar la prueba: {error}</p>}
      {resultado && (
        <div className="canales-resultado" role="status">
          <p className={resultado.estado === 'entregado' ? 'aviso aviso-exito' : 'aviso aviso-advertencia'}>
            {resultado.estado === 'entregado'
              ? `Entregado por ${ETIQUETA_CANAL[resultado.canalEntregado] ?? resultado.canalEntregado}.`
              : resultado.estado === 'sin_canales'
                ? 'No hay canales activos y disponibles para la prueba.'
                : 'Ningún canal aceptó el mensaje. Revisa el detalle de cada intento.'}
          </p>
          <p className="texto-suave">
            Referencia {resultado.id} · Cadena probada: {resultado.orden.map((c) => ETIQUETA_CANAL[c] ?? c).join(' → ')}
          </p>
          <div className="tabla-contenedor">
            <table className="tabla tabla-resultado-prueba">
              <thead>
                <tr><th>Canal</th><th>Resultado</th><th>Destino</th><th>Proveedor</th><th>Consumo HU-39</th><th>Detalle</th></tr>
              </thead>
              <tbody>
                {resultado.resultados.map((item, indice) => (
                  <tr key={`${item.canal}-${indice}`}>
                    <td data-etiqueta="Canal"><strong>{ETIQUETA_CANAL[item.canal] ?? item.canal}</strong></td>
                    <td data-etiqueta="Resultado">
                      <span className={`insignia-consumo ${resultadoClase(item.estado)}`}>
                        {ETIQUETA_RESULTADO[item.estado] ?? item.estado}
                      </span>
                    </td>
                    <td data-etiqueta="Destino">{item.destino ?? '—'}</td>
                    <td data-etiqueta="Proveedor">{item.proveedor ?? '—'}</td>
                    <td data-etiqueta="Consumo HU-39">
                      {item.consumo?.contado
                        ? 'Registrado'
                        : item.consumo?.liberado
                          ? 'Reserva liberada'
                          : item.consumo?.reservado
                            ? 'Pendiente de registro'
                            : 'Sin consumo'}
                    </td>
                    <td data-etiqueta="Detalle">{[item.motivo, item.advertencia].filter(Boolean).join(' ') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

export default function ConfiguracionCanales() {
  const [canales, setCanales] = useState([]);
  const [consumo, setConsumo] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [errorCanales, setErrorCanales] = useState('');
  const [errorConsumo, setErrorConsumo] = useState('');
  const [errorPrueba, setErrorPrueba] = useState('');
  const [resultado, setResultado] = useState(null);
  const [pushAdmin, setPushAdmin] = useState({ ocupado: false, mensaje: '', error: false });

  const cargar = useCallback(async () => {
    setCargando(true);
    const [respuestaCanales, respuestaConsumo] = await Promise.allSettled([
      listarCanales(),
      obtenerConsumoPropio(),
    ]);
    if (respuestaCanales.status === 'fulfilled') {
      setCanales(respuestaCanales.value);
      setErrorCanales('');
    } else {
      setErrorCanales(respuestaCanales.reason?.message ?? 'Error desconocido');
    }
    if (respuestaConsumo.status === 'fulfilled') {
      setConsumo(respuestaConsumo.value);
      setErrorConsumo('');
    } else {
      setErrorConsumo(respuestaConsumo.reason?.message ?? 'Error desconocido');
    }
    setCargando(false);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function alternar(item) {
    if (guardando) return;
    const anteriores = canales;
    const nuevos = canales.map((c) => (c.canal === item.canal ? { ...c, activo: !c.activo } : c));
    setCanales(nuevos);
    setGuardando(item.canal);
    setErrorCanales('');
    try {
      setCanales(await guardarCanales(nuevos));
    } catch (e) {
      setCanales(anteriores);
      setErrorCanales(e.message);
    } finally {
      setGuardando(null);
    }
  }

  async function activarPush() {
    setPushAdmin({ ocupado: true, mensaje: '', error: false });
    try {
      const respuesta = await activarPushAdministrador();
      setPushAdmin({
        ocupado: false,
        mensaje: respuesta.resultado === 'activado'
          ? `Push activado en ${respuesta.dispositivo ?? 'este dispositivo'}. Ya puedes probar el canal.`
          : respuesta.mensaje,
        error: respuesta.resultado !== 'activado',
      });
    } catch (e) {
      setPushAdmin({ ocupado: false, mensaje: e.message ?? 'No se pudo activar el push', error: true });
    }
  }

  async function desactivarPush() {
    setPushAdmin({ ocupado: true, mensaje: '', error: false });
    try {
      const respuesta = await desactivarPushAdministrador();
      setPushAdmin({ ocupado: false, mensaje: respuesta.mensaje, error: respuesta.resultado === 'sin-soporte' });
    } catch (e) {
      setPushAdmin({ ocupado: false, mensaje: e.message ?? 'No se pudo quitar el push', error: true });
    }
  }

  async function enviar(canalInicial) {
    setEnviando(true);
    setErrorPrueba('');
    setResultado(null);
    try {
      setResultado(await enviarPruebaNotificacion(canalInicial));
    } catch (e) {
      setErrorPrueba(e.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="canales-panel" aria-label="Canales, consumo y prueba de notificaciones">
      <section className="tarjeta canales-seccion" aria-labelledby="titulo-canales-sede">
        <h3 id="titulo-canales-sede">Canales de notificación</h3>
        <p className="texto-suave">
          Activa o desactiva SMS, correo y push para la prueba y los avisos no críticos. Los avisos operativos
          no se bloquean: siguen con su respaldo automático push → SMS → correo.
        </p>

        {errorCanales && (
          <p className="aviso aviso-error" role="alert">No se pudieron cargar las preferencias de canales: {errorCanales}</p>
        )}
        {cargando ? (
          <Cargando texto="Cargando los canales de notificación…" className="cargando-bloque" />
        ) : (
          !errorCanales && (
            <ul className="lista-canales" aria-label="Canales de notificación">
              {canales.map((item) => {
                const descripcionId = `canal-${item.canal}-ayuda`;
                return (
                  <li className="canal-fila" key={item.canal}>
                    <div>
                      <strong>{item.etiqueta ?? ETIQUETA_CANAL[item.canal]}</strong>
                      <p id={descripcionId} className="texto-suave">
                        {item.disponible
                          ? `Proveedor: ${item.proveedor ?? 'configurado'}`
                          : item.motivo ?? 'Proveedor no disponible en este ambiente'}
                      </p>
                    </div>
                    <label className="interruptor">
                      <input
                        type="checkbox"
                        role="switch"
                        checked={item.activo}
                        disabled={Boolean(guardando)}
                        aria-label={`Canal ${item.etiqueta ?? ETIQUETA_CANAL[item.canal]}`}
                        aria-describedby={descripcionId}
                        onChange={() => alternar(item)}
                      />
                      <span className="interruptor-pista" aria-hidden="true"><span className="interruptor-bola" /></span>
                      <span className="interruptor-texto">{item.activo ? 'Activo' : 'Inactivo'}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )
        )}
      </section>

      <PanelPushAdmin
        disponible={canales.some((item) => item.canal === 'push' && item.disponible !== false)}
        estado={pushAdmin}
        onActivar={activarPush}
        onDesactivar={desactivarPush}
      />
      <PanelConsumo consumo={consumo} error={errorConsumo} onReintentar={cargar} />
      <PanelPrueba canales={canales} enviando={enviando} resultado={resultado} error={errorPrueba} onEnviar={enviar} />
    </div>
  );
}
