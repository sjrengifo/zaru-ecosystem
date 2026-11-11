// HU-34 (ZARU-23) — Bitácora de notificaciones del establecimiento (solo administrador).
//
// Qué muestra (RF-F6-20):
//   fecha, hora, cliente, placa, canal, tipo (operativa/comercial) y estado.
// Filtros combinables (RF-F6-21): placa, rango de fechas, canal y estado. La consulta y la paginación
// las resuelve el servidor, que ya limita todo al establecimiento de la sesión (HU-41).
//
// El backend entrega el destino enmascarado (`300****567`, `yel****@gmail.com`) porque el dato real
// está cifrado y nunca sale completo al panel. "Enviada" = el proveedor aceptó el mensaje;
// "Entregada" = el proveedor confirmó la entrega. El detalle muestra cada intento con su motivo real.
import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Search, Send } from 'lucide-react';
import Cargando from '../components/Cargando.jsx';
import Modal from '../components/Modal.jsx';
import {
  ETIQUETAS_CANAL,
  ETIQUETAS_TIPO,
  FILTROS_VACIOS,
  estadoNotificacion,
  fechaYHora,
  hayFiltros,
  horaBogota,
  textoEntrega,
} from '../lib/notificaciones.js';
import { listarNotificaciones, obtenerNotificacion } from '../services/notificaciones.js';
import '../styles/notificaciones.css';

const POR_PAGINA = 20;

const ESTADOS = ['programada', 'pendiente', 'enviando', 'enviada', 'entregada', 'fallida', 'cancelada'];
const CANALES = ['correo', 'sms', 'push'];
const TIPOS = ['operativa', 'comercial'];

function EtiquetaEstado({ estado }) {
  const { texto, clase } = estadoNotificacion(estado);
  return <span className={`estado-etiqueta ${clase}`}>{texto}</span>;
}

function Fila({ n, onAbrir }) {
  return (
    <tr>
      <td data-etiqueta="Fecha y hora">
        <span className="envio-fecha">{fechaYHora(n.fecha)}</span>
        <span className="envio-hora">{horaBogota(n.fecha)}</span>
      </td>
      <td data-etiqueta="Cliente">{n.cliente || '—'}</td>
      <td data-etiqueta="Placa">{n.placa ? <span className="placa">{n.placa}</span> : '—'}</td>
      <td data-etiqueta="Canal">{ETIQUETAS_CANAL[n.canal] ?? n.canal}</td>
      <td data-etiqueta="Tipo">{ETIQUETAS_TIPO[n.tipo] ?? n.tipo}</td>
      <td data-etiqueta="Estado"><EtiquetaEstado estado={n.estado} /></td>
      <td data-etiqueta="Destino" className="envio-destino">{n.destino || '—'}</td>
      <td className="tabla-acciones">
        <button type="button" className="boton-fila" onClick={() => onAbrir(n.id)} title="Ver detalle e intentos" aria-label={`Ver detalle de la notificación de ${n.placa ?? 'la orden'}`}>
          <Search size={18} aria-hidden="true" />
        </button>
      </td>
    </tr>
  );
}

/** Detalle: cada intento con proveedor, error real y si se podía reintentar. */
function DetalleNotificacion({ id, onCerrar }) {
  const [estado, setEstado] = useState({ cargando: true, datos: null, error: '' });

  useEffect(() => {
    let vigente = true;
    setEstado({ cargando: true, datos: null, error: '' });
    obtenerNotificacion(id)
      .then((datos) => vigente && setEstado({ cargando: false, datos, error: '' }))
      .catch((error) => vigente && setEstado({ cargando: false, datos: null, error: error.message }))
      .finally(() => {});
    return () => {
      vigente = false;
    };
  }, [id]);

  const { cargando, datos, error } = estado;

  return (
    <Modal titulo="Detalle de la notificación" onCerrar={onCerrar}>
      <div className="modal-cuerpo envio-detalle">
        {cargando && <Cargando texto="Cargando el detalle…" />}
        {error && (
          <div className="aviso aviso-error" role="alert">
            <p>{error}</p>
          </div>
        )}
        {datos && (
          <>
            <dl className="envio-detalle-datos">
              <div><dt>Fecha y hora</dt><dd>{fechaYHora(datos.fecha)}</dd></div>
              <div><dt>Cliente</dt><dd>{datos.cliente || '—'}</dd></div>
              <div><dt>Placa</dt><dd>{datos.placa || '—'}</dd></div>
              <div><dt>Canal</dt><dd>{ETIQUETAS_CANAL[datos.canal] ?? datos.canal}</dd></div>
              <div><dt>Tipo</dt><dd>{ETIQUETAS_TIPO[datos.tipo] ?? datos.tipo}</dd></div>
              <div><dt>Estado</dt><dd><EtiquetaEstado estado={datos.estado} /></dd></div>
              <div><dt>Destino (enmascarado)</dt><dd>{datos.destino || '—'}</dd></div>
              <div><dt>Proveedor</dt><dd>{datos.proveedor || '—'}</dd></div>
              <div><dt>Entrega</dt><dd>{textoEntrega(datos)}</dd></div>
              <div><dt>Intentos</dt><dd>{datos.totalIntentos}</dd></div>
            </dl>

            {datos.error && (
              <div className="aviso aviso-advertencia" role="status">
                <p><strong>Último error del proveedor:</strong> {datos.error}</p>
                {datos.proximoIntentoAt && <p>Próximo reintento: {fechaYHora(datos.proximoIntentoAt)}</p>}
              </div>
            )}

            <h4 className="envio-intentos-titulo">Intentos de envío</h4>
            {!datos.detalleIntentos ? (
              <p className="texto-suave">
                El detalle por intento todavía no está habilitado en este ambiente. El estado y el último
                error sí reflejan la respuesta real del proveedor.
              </p>
            ) : datos.intentos.length === 0 ? (
              <p className="texto-suave">Todavía no se ha intentado enviar esta notificación.</p>
            ) : (
              <ol className="envio-intentos">
                {datos.intentos.map((intento) => (
                  <li key={`${intento.intento}-${intento.canal}-${intento.fecha}`} className={`envio-intento envio-intento-${intento.resultado}`}>
                    <div className="envio-intento-cabecera">
                      <strong>Intento {intento.intento} · {ETIQUETAS_CANAL[intento.canal] ?? intento.canal}</strong>
                      <span className={`estado-etiqueta ${intento.resultado === 'enviado' ? 'estado-envio-enviada' : 'estado-envio-fallida'}`}>
                        {intento.resultado === 'enviado' ? 'Aceptado por el proveedor' : 'Fallido'}
                      </span>
                    </div>
                    <p className="envio-intento-meta">
                      {fechaYHora(intento.fecha)}
                      {intento.proveedor ? ` · ${intento.proveedor}` : ''}
                      {intento.recuperable === true ? ' · error recuperable' : ''}
                      {intento.recuperable === false ? ' · error permanente (no se reintenta)' : ''}
                      {intento.entregado ? ' · entrega confirmada' : ''}
                    </p>
                    {intento.error && <p className="envio-intento-error">{intento.error}</p>}
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

export default function HistorialNotificaciones() {
  const [borrador, setBorrador] = useState({ ...FILTROS_VACIOS });
  const [filtros, setFiltros] = useState({ ...FILTROS_VACIOS });
  const [pagina, setPagina] = useState(1);
  const [datos, setDatos] = useState({ notificaciones: [], paginacion: { pagina: 1, porPagina: POR_PAGINA, total: 0, totalPaginas: 0 } });
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [detalleId, setDetalleId] = useState(null);
  const [recargas, setRecargas] = useState(0);

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    setError('');
    listarNotificaciones({ ...filtros, pagina, porPagina: POR_PAGINA })
      .then((respuesta) => {
        if (vigente) setDatos(respuesta);
      })
      .catch((fallo) => {
        if (vigente) setError(fallo.message || 'No se pudo consultar la bitácora.');
      })
      .finally(() => {
        if (vigente) setCargando(false);
      });
    return () => {
      vigente = false;
    };
  }, [filtros, pagina, recargas]);

  const cambiar = (campo) => (evento) => setBorrador((previo) => ({ ...previo, [campo]: evento.target.value }));

  function consultar(evento) {
    evento.preventDefault();
    setPagina(1);
    setFiltros({ ...borrador });
  }

  function limpiar() {
    setBorrador({ ...FILTROS_VACIOS });
    setPagina(1);
    setFiltros({ ...FILTROS_VACIOS });
  }

  const cerrarDetalle = useCallback(() => setDetalleId(null), []);
  const { notificaciones, paginacion } = datos;
  const sinResultados = !cargando && !error && notificaciones.length === 0;

  return (
    <section className="envios">
      <div className="encabezado">
        <div>
          <h2>Notificaciones</h2>
          <p className="dashboard-subtitulo">
            Bitácora de los avisos enviados a tus clientes, con el estado real que reporta el proveedor.
          </p>
        </div>
        <button type="button" className="boton secundario boton-pequeno" onClick={() => setRecargas((n) => n + 1)} disabled={cargando}>
          <RefreshCw size={16} aria-hidden="true" /> Actualizar
        </button>
      </div>

      <form className="tarjeta reporte-filtros" onSubmit={consultar}>
        <div className="reporte-filtros-campos">
          <div className="campo envio-campo">
            <label htmlFor="envio-placa">Placa</label>
            <input id="envio-placa" value={borrador.placa} onChange={cambiar('placa')} placeholder="ABC123" maxLength={10} autoComplete="off" />
          </div>
          <div className="campo envio-campo">
            <label htmlFor="envio-desde">Desde</label>
            <input id="envio-desde" type="date" value={borrador.desde} onChange={cambiar('desde')} />
          </div>
          <div className="campo envio-campo">
            <label htmlFor="envio-hasta">Hasta</label>
            <input id="envio-hasta" type="date" value={borrador.hasta} onChange={cambiar('hasta')} />
          </div>
          <div className="campo envio-campo">
            <label htmlFor="envio-canal">Canal</label>
            <select id="envio-canal" value={borrador.canal} onChange={cambiar('canal')}>
              <option value="">Todos</option>
              {CANALES.map((canal) => <option key={canal} value={canal}>{ETIQUETAS_CANAL[canal]}</option>)}
            </select>
          </div>
          <div className="campo envio-campo">
            <label htmlFor="envio-estado">Estado</label>
            <select id="envio-estado" value={borrador.estado} onChange={cambiar('estado')}>
              <option value="">Todos</option>
              {ESTADOS.map((estado) => <option key={estado} value={estado}>{estadoNotificacion(estado).texto}</option>)}
            </select>
          </div>
          <div className="campo envio-campo">
            <label htmlFor="envio-tipo">Tipo</label>
            <select id="envio-tipo" value={borrador.tipo} onChange={cambiar('tipo')}>
              <option value="">Todos</option>
              {TIPOS.map((tipo) => <option key={tipo} value={tipo}>{ETIQUETAS_TIPO[tipo]}</option>)}
            </select>
          </div>
          <button className="boton" type="submit" disabled={cargando} aria-busy={cargando}>
            <Search size={16} aria-hidden="true" /> {cargando ? 'Consultando…' : 'Filtrar'}
          </button>
          <button className="boton secundario" type="button" onClick={limpiar} disabled={cargando || !hayFiltros(borrador)}>
            Limpiar filtros
          </button>
        </div>
      </form>

      {error && (
        <div className="aviso aviso-error" role="alert">
          <p>{error}</p>
          <button type="button" className="boton secundario boton-pequeno" onClick={() => setRecargas((n) => n + 1)}>Reintentar</button>
        </div>
      )}

      <div className="tabla-contenedor">
        <table className="tabla">
          <thead>
            <tr>
              <th scope="col">Fecha y hora</th>
              <th scope="col">Cliente</th>
              <th scope="col">Placa</th>
              <th scope="col">Canal</th>
              <th scope="col">Tipo</th>
              <th scope="col">Estado</th>
              <th scope="col">Destino</th>
              <th scope="col" className="tabla-acciones" aria-label="Acciones" />
            </tr>
          </thead>
          <tbody>
            {cargando && notificaciones.length === 0 ? (
              <tr>
                <td colSpan={8} className="tabla-vacia"><Cargando texto="Consultando notificaciones…" /></td>
              </tr>
            ) : sinResultados ? (
              <tr>
                <td colSpan={8} className="tabla-vacia">
                  {hayFiltros(filtros)
                    ? 'No hay notificaciones que coincidan con los filtros. Prueba con otro rango o limpia los filtros.'
                    : 'Aún no se han enviado notificaciones a tus clientes.'}
                </td>
              </tr>
            ) : (
              notificaciones.map((n) => <Fila key={n.id} n={n} onAbrir={setDetalleId} />)
            )}
          </tbody>
        </table>
      </div>

      <div className="envio-paginacion" role="navigation" aria-label="Paginación de notificaciones">
        <p className="texto-suave">
          {paginacion.total === 0
            ? 'Sin resultados'
            : `${paginacion.total} notificación${paginacion.total === 1 ? '' : 'es'} · página ${paginacion.pagina} de ${Math.max(1, paginacion.totalPaginas)}`}
        </p>
        <div className="envio-paginacion-botones">
          <button type="button" className="boton secundario boton-pequeno" onClick={() => setPagina((p) => Math.max(1, p - 1))} disabled={cargando || pagina <= 1}>
            Anterior
          </button>
          <button type="button" className="boton secundario boton-pequeno" onClick={() => setPagina((p) => p + 1)} disabled={cargando || pagina >= Math.max(1, paginacion.totalPaginas)}>
            Siguiente
          </button>
        </div>
      </div>

      <p className="envio-nota">
        <Send size={14} aria-hidden="true" /> “Enviada” significa que el proveedor aceptó el mensaje; “Entregada”
        solo cuando el proveedor confirma la entrega. Los celulares y correos se muestran enmascarados.
      </p>

      {detalleId && <DetalleNotificacion id={detalleId} onCerrar={cerrarDetalle} />}
    </section>
  );
}
