// HU-08, HU-09, HU-10, HU-11 · Dashboard operativo en tiempo real (ZARU-9 a ZARU-12)
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { api } from '../services/api.js';
import { formatoMoneda } from '../lib/formato.js';
import FormularioIngreso from '../components/FormularioIngreso.jsx';
import Notificacion from '../components/Notificacion.jsx';

const ESTADOS = [
  { id: 'recibido', titulo: 'Recibido' },
  { id: 'en_lavado', titulo: 'En lavado' },
  { id: 'secado', titulo: 'Secado' },
  { id: 'listo', titulo: 'Listo' },
  { id: 'entregado', titulo: 'Entregado' },
];

const TITULO_ESTADO = Object.fromEntries(ESTADOS.map(({ id, titulo }) => [id, titulo]));
const SIGUIENTE_ESTADO = {
  recibido: 'en_lavado',
  en_lavado: 'secado',
  secado: 'listo',
  listo: 'entregado',
};

const hora = (fecha) => new Date(fecha).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });

export default function Dashboard() {
  const [ordenes, setOrdenes] = useState([]);
  const [error, setError] = useState('');
  const [ingresando, setIngresando] = useState(false);
  const [avanzando, setAvanzando] = useState(null);
  const [confirmacion, setConfirmacion] = useState(null);
  const cerrarConfirmacion = useCallback(() => setConfirmacion(null), []);

  async function cargarOrdenes() {
    // TODO HU-09: cambiar por api.get('/ordenes/activas') cuando el backend esté listo.
    const { data, error: fallo } = await supabase
      .from('ordenes')
      .select(
        'id, estado, created_at, total, codigo_seguimiento, entrega_estimada_at, vehiculos(placa), orden_servicios(precio, servicios(nombre))',
      )
      .order('created_at');
    if (fallo) return setError('No se pudieron cargar las órdenes.');
    setError('');
    setOrdenes(data || []);
  }

  useEffect(() => {
    cargarOrdenes();

    // HU-09 CA2: escuchar cambios en tiempo real, sin recargar la página.
    const canal = supabase
      .channel('ordenes-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ordenes' }, cargarOrdenes)
      .subscribe();

    return () => supabase.removeChannel(canal);
  }, []);

  function alIngresar(orden) {
    setIngresando(false);
    setConfirmacion({
      id: Date.now(),
      titulo: 'Vehículo ingresado',
      detalle: `${orden.vehiculo?.placa ?? 'Vehículo'} · ${formatoMoneda(orden.total)} · Código ${orden.codigoSeguimiento}`,
    });
    cargarOrdenes();
  }

  async function avanzarEstado(orden) {
    const siguiente = SIGUIENTE_ESTADO[orden.estado];
    if (!siguiente || avanzando) return;

    setAvanzando(orden.id);
    setError('');
    try {
      const actualizada = await api.patch(`/ordenes/${orden.id}/estado`, { estado: siguiente });
      setConfirmacion({
        id: Date.now(),
        titulo: 'Estado actualizado',
        detalle: `${actualizada.vehiculo?.placa ?? 'Vehículo'} · ${TITULO_ESTADO[actualizada.estado]}`,
      });
      await cargarOrdenes();
    } catch (fallo) {
      setError(fallo.message || 'No se pudo actualizar el estado.');
      if (fallo.status === 409) await cargarOrdenes();
    } finally {
      setAvanzando(null);
    }
  }

  return (
    <section>
      <div className="encabezado">
        <h2>Dashboard</h2>
        <button
          className="boton"
          onClick={() => {
            setConfirmacion(null);
            setIngresando(true);
          }}
        >
          + Ingresar vehículo
        </button>
      </div>

      <div className="notificaciones" role="status">
        {confirmacion && (
          <Notificacion key={confirmacion.id} titulo={confirmacion.titulo} detalle={confirmacion.detalle} onCerrar={cerrarConfirmacion} />
        )}
      </div>

      {ingresando && <FormularioIngreso onCreada={alIngresar} onCancelar={() => setIngresando(false)} />}

      {error && (
        <div className="aviso aviso-error" role="alert">
          <p>{error}</p>
        </div>
      )}

      {/* TODO HU-09 CA3: resumen del día (vehículos atendidos e ingresos) */}

      <div className="tablero">
        {ESTADOS.map((estado) => (
          <div key={estado.id} className="columna">
            <h3>{estado.titulo}</h3>
            {ordenes
              .filter((o) => o.estado === estado.id)
              .map((o) => {
                const siguiente = SIGUIENTE_ESTADO[o.estado];
                return (
                  // TODO HU-11: resaltar si supera la duración estimada
                  <div key={o.id} className="tarjeta tarjeta-vehiculo">
                    <div className="tarjeta-vehiculo-datos">
                      <strong>{o.vehiculos?.placa ?? 'Vehículo eliminado'}</strong>
                      <span className="texto-suave">
                        {hora(o.created_at)} · {formatoMoneda(o.total)}
                      </span>
                      <span className="texto-suave">
                        {o.orden_servicios?.map((s) => s.servicios?.nombre).filter(Boolean).join(', ') || 'Sin servicios'}
                      </span>
                      <span className="texto-suave">
                        Código {o.codigo_seguimiento}
                        {o.entrega_estimada_at ? ` · Entrega ${hora(o.entrega_estimada_at)}` : ''}
                      </span>
                    </div>
                    {siguiente && (
                      <button
                        type="button"
                        className="boton"
                        onClick={() => avanzarEstado(o)}
                        disabled={avanzando !== null}
                        aria-busy={avanzando === o.id}
                      >
                        {avanzando === o.id ? 'Guardando…' : `Avanzar a ${TITULO_ESTADO[siguiente]}`}
                      </button>
                    )}
                  </div>
                );
              })}
          </div>
        ))}
      </div>
    </section>
  );
}
