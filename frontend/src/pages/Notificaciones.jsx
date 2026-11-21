// HU-31 — Estados que generan notificación por establecimiento.
// CA1: los cinco estados del flujo con un interruptor.
// CA2: "listo para entrega" es obligatorio y no se puede apagar.
// CA3: cada cambio se guarda al instante y solo afecta a la sede de la sesión.
import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api.js';
import Cargando from '../components/Cargando.jsx';
import Notificacion from '../components/Notificacion.jsx';

const DESCRIPCIONES = {
  recibido: 'Cuando registras el ingreso del vehículo.',
  en_lavado: 'Cuando el vehículo empieza el lavado.',
  secado: 'Cuando el vehículo pasa al secado y los detalles finales.',
  listo: 'Cuando el vehículo queda listo para recoger. Es un estado obligatorio de la plataforma: este aviso siempre se envía.',
  entregado: 'Cuando entregas el vehículo al cliente.',
};

const nombre = (item) => item.titulo ?? item.estado;

export default function Notificaciones() {
  const [estados, setEstados] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(null);
  const [errorCarga, setErrorCarga] = useState('');
  const [errorGuardado, setErrorGuardado] = useState('');
  const [confirmacion, setConfirmacion] = useState(null);
  const [intento, setIntento] = useState(0);
  const cerrarConfirmacion = useCallback(() => setConfirmacion(null), []);
  const reintentar = () => setIntento((n) => n + 1);

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    api
      .get('/configuracion/notificaciones')
      .then((lista) => {
        if (!vigente) return;
        setEstados(lista);
        setErrorCarga('');
      })
      .catch((e) => {
        if (vigente) setErrorCarga(`No se pudo cargar la configuración de notificaciones: ${e.message}`);
      })
      .finally(() => {
        if (vigente) setCargando(false);
      });
    return () => {
      vigente = false;
    };
  }, [intento]);

  async function alternar(item) {
    if (item.obligatorio || guardando) return;

    const anteriores = estados;
    const nuevos = estados.map((e) => (e.estado === item.estado ? { ...e, activo: !e.activo } : e));
    setEstados(nuevos);
    setGuardando(item.estado);
    setErrorGuardado('');

    try {
      const guardados = await api.put(
        '/configuracion/notificaciones',
        nuevos.map(({ estado, activo }) => ({ estado, activo })),
      );
      setEstados(guardados);
      const actualizado = guardados.find((e) => e.estado === item.estado);
      setConfirmacion({
        id: Date.now(),
        titulo: actualizado?.activo ? 'Aviso activado' : 'Aviso desactivado',
        detalle: `${nombre(item)}: ${actualizado?.activo ? 'los clientes recibirán este aviso.' : 'los clientes ya no recibirán este aviso.'}`,
      });
    } catch (e) {
      setEstados(anteriores); // La pantalla vuelve a lo último que sí quedó guardado.
      setErrorGuardado(e.message);
    } finally {
      setGuardando(null);
    }
  }

  return (
    <section>
      <div className="encabezado">
        <h2>Configuración de notificaciones</h2>
      </div>
      <p className="texto-suave">
        Elige en qué estados del servicio quieres avisar a tus clientes por correo. Los cambios se aplican de inmediato
        y solo a esta sede.
      </p>

      <div className="notificaciones" role="status">
        {confirmacion && (
          <Notificacion key={confirmacion.id} titulo={confirmacion.titulo} detalle={confirmacion.detalle} onCerrar={cerrarConfirmacion} />
        )}
      </div>

      {errorCarga && (
        <div className="aviso aviso-error" role="alert">
          <p>{errorCarga}</p>
          <button type="button" className="boton secundario" onClick={reintentar}>
            Reintentar
          </button>
        </div>
      )}

      {errorGuardado && (
        <div className="aviso aviso-error" role="alert">
          <p>{errorGuardado}</p>
        </div>
      )}

      {cargando ? (
        <Cargando texto="Cargando la configuración de notificaciones…" className="tarjeta cargando-bloque" />
      ) : (
        !errorCarga && (
          <div className="tarjeta">
            <ul className="lista-interruptores" aria-label="Estados que generan notificación">
              {estados.map((item) => {
                const descripcionId = `estado-${item.estado}-ayuda`;
                return (
                  <li key={item.estado} className="interruptor-estado">
                    <div className="interruptor-estado-texto">
                      <strong>
                        {nombre(item)}
                        {item.obligatorio && <span className="etiqueta-obligatorio">Obligatorio</span>}
                      </strong>
                      <p id={descripcionId} className="texto-suave">
                        {DESCRIPCIONES[item.estado]}
                      </p>
                    </div>
                    <label className="interruptor">
                      <input
                        type="checkbox"
                        role="switch"
                        checked={item.activo}
                        disabled={item.obligatorio || Boolean(guardando)}
                        aria-label={`Notificaciones de ${nombre(item)}`}
                        aria-describedby={descripcionId}
                        onChange={() => alternar(item)}
                      />
                      <span className="interruptor-pista" aria-hidden="true">
                        <span className="interruptor-bola" />
                      </span>
                      <span className="interruptor-texto">{item.activo ? 'Activo' : 'Inactivo'}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        )
      )}
    </section>
  );
}
