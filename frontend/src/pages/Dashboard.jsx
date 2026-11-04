// HU-08, HU-09, HU-10 y HU-46 · Dashboard operativo en tiempo real (ZARU-9 a ZARU-11, ZARU-53)
// - Ingreso de vehículo y avance de estado con un clic; al registrar el ingreso y al pasar a "Listo"
//   la API envía el correo al cliente (HU-46 CA1, CA2).
// - HU-46 CA3: el resultado del correo solo se informa; el operario sigue trabajando sin esperar.
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { api } from '../services/api.js';
import { mensajeCorreo, etiquetaCorreo } from '../lib/avisoCorreo.js';
import Modal from '../components/Modal.jsx';
import Notificacion from '../components/Notificacion.jsx';
import FormularioIngreso from '../components/FormularioIngreso.jsx';

export const ESTADOS = [
  { id: 'recibido', titulo: 'Recibido', accion: 'Pasar a lavado' },
  { id: 'en_lavado', titulo: 'En lavado', accion: 'Marcar como listo' },
  { id: 'listo', titulo: 'Listo', accion: 'Entregar' },
];
const SIGUIENTE = { recibido: 'en_lavado', en_lavado: 'listo', listo: 'entregado' };
const RECARGA_CORREO_MS = 4000; // tiempo para ver el resultado del envío en segundo plano

const hora = (fecha) => new Date(fecha).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });

export default function Dashboard() {
  const [ordenes, setOrdenes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [ingresoAbierto, setIngresoAbierto] = useState(false);
  const [moviendo, setMoviendo] = useState(null);
  const [aviso, setAviso] = useState(null);
  const recargaPendiente = useRef(null);
  const cerrarAviso = useCallback(() => setAviso(null), []);

  const cargarOrdenes = useCallback(async () => {
    try {
      setOrdenes(await api.get('/ordenes/activas'));
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }, []);

  // El correo se envía después de responder: se vuelve a consultar para mostrar si salió o falló.
  const recargarDespues = useCallback(() => {
    clearTimeout(recargaPendiente.current);
    recargaPendiente.current = setTimeout(cargarOrdenes, RECARGA_CORREO_MS);
  }, [cargarOrdenes]);

  useEffect(() => {
    cargarOrdenes();
    // HU-09 CA2: escuchar cambios en tiempo real, sin recargar la página.
    const canal = supabase
      .channel('ordenes-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ordenes' }, cargarOrdenes)
      .subscribe();
    return () => {
      clearTimeout(recargaPendiente.current);
      supabase.removeChannel(canal);
    };
  }, [cargarOrdenes]);

  function informar(titulo, notificacion) {
    const correo = mensajeCorreo(notificacion);
    setAviso({ id: Date.now(), titulo, detalle: correo?.texto, tipo: correo?.tipo === 'advertencia' ? 'advertencia' : 'exito' });
  }

  async function avanzar(orden) {
    const estado = SIGUIENTE[orden.estado];
    setMoviendo(orden.id);
    setError('');
    try {
      const resultado = await api.patch(`/ordenes/${orden.id}/estado`, { estado });
      const titulo = estado === 'entregado'
        ? `${orden.vehiculo?.placa} entregado`
        : `${orden.vehiculo?.placa} pasó a ${ESTADOS.find((e) => e.id === estado)?.titulo}`;
      informar(titulo, resultado.notificacion);
      await cargarOrdenes();
      if (resultado.notificacion?.estado === 'pendiente') recargarDespues();
    } catch (e) {
      setError(e.message);
      await cargarOrdenes();
    } finally {
      setMoviendo(null);
    }
  }

  return (
    <section>
      <div className="encabezado">
        <h2>Dashboard</h2>
        <button className="boton" type="button" onClick={() => setIngresoAbierto(true)}>+ Ingresar vehículo</button>
      </div>

      {error && <p className="aviso aviso-error" role="alert">{error}</p>}
      {cargando && <p className="texto-suave">Cargando órdenes…</p>}

      {ingresoAbierto && (
        <Modal titulo="Ingresar vehículo" onCerrar={() => setIngresoAbierto(false)}>
          <FormularioIngreso
            onCancelar={() => setIngresoAbierto(false)}
            onCreada={(orden) => {
              setIngresoAbierto(false);
              informar(`Ingreso de ${orden.vehiculo?.placa} registrado`, orden.notificacion);
              cargarOrdenes();
              if (orden.notificacion?.estado === 'pendiente') recargarDespues();
            }}
          />
        </Modal>
      )}

      <div className="notificaciones" role="status">
        {aviso && <Notificacion key={aviso.id} titulo={aviso.titulo} detalle={aviso.detalle} tipo={aviso.tipo} onCerrar={cerrarAviso} />}
      </div>

      <div className="tablero">
        {ESTADOS.map((estado) => {
          const lista = ordenes.filter((o) => o.estado === estado.id);
          return (
            <div key={estado.id} className="columna" aria-label={estado.titulo}>
              <h3>{estado.titulo} <span className="contador">{lista.length}</span></h3>
              {lista.map((o) => {
                const correo = etiquetaCorreo(o);
                return (
                  <article key={o.id} className="tarjeta tarjeta-vehiculo">
                    <div className="tarjeta-vehiculo-fila">
                      <strong className="placa">{o.vehiculo?.placa ?? 'Vehículo eliminado'}</strong>
                      <span className="texto-suave">{hora(o.estadoDesde ?? o.creadaEn)}</span>
                    </div>
                    {o.cliente && <span className="texto-suave">{o.cliente.nombre}</span>}
                    {correo && <span className={`etiqueta-correo etiqueta-${correo.tipo}`}>✉ {correo.texto}</span>}
                    <button
                      type="button"
                      className="boton boton-pequeno"
                      disabled={moviendo === o.id}
                      aria-busy={moviendo === o.id}
                      onClick={() => avanzar(o)}
                    >
                      {estado.accion}
                    </button>
                  </article>
                );
              })}
              {!lista.length && !cargando && <p className="texto-suave columna-vacia">Sin vehículos</p>}
            </div>
          );
        })}
      </div>
    </section>
  );
}
