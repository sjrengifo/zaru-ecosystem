// HU-18 — Estado del lavado en tiempo real para la pantalla del cliente final.
//
// CA1: consulta el seguimiento al abrir la pantalla.
// CA2: después se queda escuchando el flujo de eventos de la API (Server-Sent Events). Cada vez
//      que el operario cambia el estado en el panel llega un evento y la pantalla se actualiza
//      sola. Si la conexión se corta, el navegador reconecta y la API vuelve a enviar el estado
//      actual. Si el navegador no soporta eventos, se consulta cada 10 s.
import { useCallback, useEffect, useRef, useState } from 'react';
import { obtenerSeguimiento, urlEventosSeguimiento } from '../services/seguimiento.js';
import { esMasReciente } from '../lib/seguimiento.js';

export const CONSULTA_RESPALDO_MS = 10_000;

/**
 * @returns {{
 *   seguimiento: object|null,
 *   estado: 'cargando'|'listo'|'no_encontrado'|'limite'|'error',
 *   conexion: 'conectando'|'en_vivo'|'reconectando'|'consulta',
 *   reintentar: () => void,
 * }}
 */
export function useSeguimiento(codigo) {
  const [seguimiento, setSeguimiento] = useState(null);
  const [estado, setEstado] = useState('cargando');
  const [conexion, setConexion] = useState('conectando');
  const [intento, setIntento] = useState(0);
  const actualRef = useRef(null);

  const mostrar = useCallback((recibido) => {
    if (!esMasReciente(actualRef.current, recibido)) return;
    actualRef.current = recibido;
    setSeguimiento(recibido);
    setEstado('listo');
  }, []);

  useEffect(() => {
    if (!codigo) return undefined;
    let activo = true;
    let fuente = null;
    let respaldo = null;
    actualRef.current = null;
    setSeguimiento(null);
    setEstado('cargando');
    setConexion('conectando');

    const consultar = async () => {
      try {
        const datos = await obtenerSeguimiento(codigo);
        if (activo) mostrar(datos);
        return true;
      } catch (err) {
        if (!activo) return false;
        if (err.status === 404) {
          setEstado('no_encontrado');
          detener();
        } else if (err.status === 429) {
          setEstado('limite');
          detener();
        } else if (!actualRef.current) {
          setEstado('error');
        }
        return false;
      }
    };

    function detener() {
      fuente?.close();
      fuente = null;
      clearInterval(respaldo);
      respaldo = null;
    }

    const escuchar = () => {
      if (typeof window.EventSource !== 'function') {
        setConexion('consulta');
        respaldo = setInterval(consultar, CONSULTA_RESPALDO_MS);
        return;
      }
      fuente = new window.EventSource(urlEventosSeguimiento(codigo));
      fuente.addEventListener('open', () => activo && setConexion('en_vivo'));
      fuente.addEventListener('estado', (evento) => {
        if (!activo) return;
        try {
          mostrar(JSON.parse(evento.data));
          setConexion('en_vivo');
        } catch {
          // Un evento mal formado se ignora; el siguiente trae el estado completo.
        }
      });
      // El código venció (24 h después de la entrega) mientras la pantalla estaba abierta.
      fuente.addEventListener('fin', () => {
        if (!activo) return;
        detener();
        setEstado('no_encontrado');
      });
      fuente.onerror = () => {
        if (!activo) return;
        // CLOSED: el servidor rechazó la reconexión (p. ej. 404). Se consulta para saber por qué.
        if (fuente?.readyState === 2) {
          detener();
          setConexion('reconectando');
          consultar().then((ok) => activo && ok && setTimeout(() => activo && !fuente && escuchar(), 5_000));
        } else {
          setConexion('reconectando');
        }
      };
    };

    consultar().then((ok) => {
      if (activo && ok) escuchar();
    });

    // Al volver a la pestaña (el celular pudo suspenderla) se trae el estado más reciente.
    const alVolver = () => {
      if (document.visibilityState === 'visible' && actualRef.current) consultar();
    };
    document.addEventListener('visibilitychange', alVolver);

    return () => {
      activo = false;
      detener();
      document.removeEventListener('visibilitychange', alVolver);
    };
  }, [codigo, intento, mostrar]);

  const reintentar = useCallback(() => setIntento((n) => n + 1), []);

  return { seguimiento, estado, conexion, reintentar };
}
