// HU-08, HU-09 y HU-10 · Dashboard operativo en tiempo real (ZARU-10).
// Reutiliza el alta de ingreso (HU-08) y el avance de estado (HU-10) que ya
// existían; HU-09 añade el tablero de cuatro columnas, los indicadores del día
// y la sincronización con Supabase Realtime.
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../services/api.js';
import { formatoMoneda } from '../lib/formato.js';
import { mensajeCorreo } from '../lib/avisoCorreo.js';
import { useDashboardOrdenes } from '../hooks/useDashboardOrdenes.js';
import { useAhora } from '../hooks/useAhora.js';
import {
  COLUMNAS_TABLERO,
  ESTADOS_ORDEN,
  SIGUIENTE_ESTADO,
  agruparPorColumna,
  calcularDemora,
  horaBogota,
  vehiculosAtendidosHoy,
  vehiculosIngresadosHoy,
} from '../lib/dashboard.js';
import ColumnaKanban from '../components/ColumnaKanban.jsx';
import IndicadoresDashboard from '../components/IndicadoresDashboard.jsx';
import FormularioIngreso from '../components/FormularioIngreso.jsx';
import AlertaDemora from '../components/AlertaDemora.jsx';
import Notificacion from '../components/Notificacion.jsx';
import Cargando from '../components/Cargando.jsx';

export default function Dashboard() {
  const {
    ordenes,
    cargando,
    actualizando,
    error,
    errorConexion,
    conectado,
    ultimaActualizacion,
    refrescar,
    reintentar,
  } = useDashboardOrdenes();
  // HU-11: referencia compartida para que la alerta de demora aparezca sola.
  const ahora = useAhora();

  const [ingresando, setIngresando] = useState(false);
  const [avanzando, setAvanzando] = useState(null);
  const [confirmacion, setConfirmacion] = useState(null);
  const [errorAccion, setErrorAccion] = useState('');
  const [alertaDemoraVisible, setAlertaDemoraVisible] = useState(false);
  const ultimaAlertaRef = useRef(0);
  const ultimaFirmaRef = useRef('');
  const cerrarConfirmacion = useCallback(() => setConfirmacion(null), []);
  const cerrarAlertaDemora = useCallback(() => setAlertaDemoraVisible(false), []);

  const grupos = agruparPorColumna(ordenes);
  const atendidos = vehiculosAtendidosHoy(ordenes);
  const ingresados = vehiculosIngresadosHoy(ordenes);
  // El reloj compartido recalcula cada segundo; así la notificación aparece
  // apenas un vehículo supera los 30 s en su estado actual.
  const demoradas = ordenes.filter((orden) => calcularDemora(orden, ahora).demorada);
  const firmaDemoras = demoradas.map((orden) => orden.id).sort().join(',');

  // Muestra la notificación cuando aparece una demora nueva y la repite cada
  // 30 s mientras el vehículo siga sin actualizar. Al cambiar el estado de forma
  // manual, `estado_desde` se reinicia y la notificación desaparece sola. En
  // cada estado nuevo vuelve a contar y, si se demora, vuelve a avisar.
  useEffect(() => {
    if (!firmaDemoras) {
      setAlertaDemoraVisible(false);
      ultimaAlertaRef.current = 0;
      ultimaFirmaRef.current = '';
      return;
    }
    if (ingresando) return;

    const ahoraMs = ahora.getTime();
    const ids = firmaDemoras.split(',');
    const anteriores = new Set(ultimaFirmaRef.current ? ultimaFirmaRef.current.split(',') : []);
    const hayNueva = ids.some((id) => !anteriores.has(id));
    const tocaRepetir = ahoraMs - ultimaAlertaRef.current >= 30_000;

    if (hayNueva || tocaRepetir) {
      setAlertaDemoraVisible(true);
      ultimaAlertaRef.current = ahoraMs;
    }
    ultimaFirmaRef.current = firmaDemoras;
  }, [firmaDemoras, ahora, ingresando]);

  function alIngresar(orden) {
    setIngresando(false);
    const aviso = mensajeCorreo(orden.notificacion);
    setConfirmacion({
      id: Date.now(),
      titulo: 'Vehículo ingresado',
      detalle: [`${orden.vehiculo?.placa ?? 'Vehículo'} · ${formatoMoneda(orden.total)} · Código ${orden.codigoSeguimiento}`, aviso?.texto].filter(Boolean).join(' · '),
      tipo: aviso?.tipo ?? 'exito',
    });
    refrescar();
  }

  async function avanzarEstado(orden) {
    const siguiente = SIGUIENTE_ESTADO[orden.estado];
    if (!siguiente || avanzando) return;

    setAvanzando(orden.id);
    setErrorAccion('');
    try {
      const actualizada = await api.patch(`/ordenes/${orden.id}/estado`, { estado: siguiente });
      const aviso = mensajeCorreo(actualizada.notificacion);
      setConfirmacion({
        id: Date.now(),
        titulo: 'Estado actualizado',
        detalle: [`${actualizada.vehiculo?.placa ?? 'Vehículo'} · ${ESTADOS_ORDEN[actualizada.estado]}`, aviso?.texto].filter(Boolean).join(' · '),
        tipo: aviso?.tipo ?? 'exito',
      });
      // No se espera al evento de Realtime: si la conexión en vivo se cayó, el
      // tablero igual queda al día con esta recarga puntual.
      refrescar();
    } catch (fallo) {
      setErrorAccion(fallo.message || 'No se pudo actualizar el estado.');
      if (fallo.status === 409) refrescar();
    } finally {
      setAvanzando(null);
    }
  }

  const textoConexion = conectado ? 'En vivo' : cargando ? 'Conectando…' : 'Sin conexión en vivo';

  return (
    <section className="dashboard">
      <div className="encabezado">
        <div>
          <h2>Dashboard operativo</h2>
          <p className="dashboard-subtitulo">
            Vehículos del día agrupados por estado, actualizados en tiempo real.
          </p>
        </div>

        <div className="dashboard-acciones">
          <span
            className={`estado-conexion ${conectado ? 'conectado' : 'desconectado'}`}
            role="status"
            title="Estado de la conexión en tiempo real"
          >
            <span className="estado-conexion-punto" aria-hidden="true" />
            {textoConexion}
          </span>
          <button
            type="button"
            className="boton"
            onClick={() => {
              setConfirmacion(null);
              setIngresando(true);
            }}
          >
            + Ingresar vehículo
          </button>
        </div>
      </div>

      <div className="notificaciones" role="status">
        {confirmacion && (
          <Notificacion
            key={confirmacion.id}
            titulo={confirmacion.titulo}
            detalle={confirmacion.detalle}
            tipo={confirmacion.tipo}
            onCerrar={cerrarConfirmacion}
          />
        )}
      </div>

      {ingresando && (
        <FormularioIngreso onCreada={alIngresar} onCancelar={() => setIngresando(false)} />
      )}

      {error && (
        <div className="aviso aviso-error" role="alert">
          <p>{error}</p>
          <button type="button" className="boton secundario" onClick={reintentar}>
            Reintentar
          </button>
        </div>
      )}

      {errorConexion && (
        <div className="aviso aviso-advertencia" role="status">
          <p>{errorConexion}</p>
          <button type="button" className="boton secundario" onClick={reintentar}>
            Reconectar
          </button>
        </div>
      )}

      {errorAccion && (
        <div className="aviso aviso-error" role="alert">
          <p>{errorAccion}</p>
        </div>
      )}

      <IndicadoresDashboard
        atendidos={atendidos}
        ingresados={ingresados}
        cargando={cargando}
        actualizando={actualizando}
      />

      {cargando ? (
        <Cargando texto="Cargando órdenes del establecimiento…" className="tarjeta cargando-bloque" />
      ) : (
        <>
          <div className="tablero">
            {COLUMNAS_TABLERO.map((columna) => (
              <ColumnaKanban
                key={columna.id}
                columna={columna}
                ordenes={grupos[columna.id]}
                onAvanzar={avanzarEstado}
                avanzando={avanzando}
                ahora={ahora}
              />
            ))}
          </div>

          {ordenes.length === 0 && (
            <p className="texto-suave dashboard-vacio">
              Aún no hay órdenes activas ni entregas registradas hoy en este establecimiento.
            </p>
          )}

          {ultimaActualizacion && (
            <p className="dashboard-actualizado">
              Última actualización: {horaBogota(ultimaActualizacion)}
              {actualizando ? ' · Sincronizando…' : ''}
            </p>
          )}
        </>
      )}

      {alertaDemoraVisible && demoradas.length > 0 && (
        <AlertaDemora
          ordenes={demoradas}
          ahora={ahora}
          onCerrar={cerrarAlertaDemora}
        />
      )}
    </section>
  );
}
