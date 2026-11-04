// HU-09 CA2 — Estado del tablero y suscripción Realtime.
// Una sola suscripción por pestaña, con nombre único para que React StrictMode
// no deje canales duplicados. Cualquier cambio en `ordenes` del establecimiento
// se agrupa en un refresco corto para no lanzar una consulta por evento.
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { listarOrdenesDelTablero } from '../services/dashboard.js';
import { useSesion } from './useSesion.js';

const ESPERA_REFRESCO_MS = 250;

export function useDashboardOrdenes() {
  const { establecimiento } = useSesion();
  // Solo se usa para el filtro de Realtime; las consultas las limita RLS.
  const establecimientoId = establecimiento?.id ?? null;

  const [ordenes, setOrdenes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [actualizando, setActualizando] = useState(false);
  const [error, setError] = useState('');
  const [errorConexion, setErrorConexion] = useState('');
  const [conectado, setConectado] = useState(false);
  const [ultimaActualizacion, setUltimaActualizacion] = useState(null);
  const [intento, setIntento] = useState(0);

  const montado = useRef(false);
  const esperaRefresco = useRef(null);

  const cargar = useCallback(async ({ silencioso = false } = {}) => {
    if (!montado.current) return;
    if (silencioso) setActualizando(true);

    try {
      const datos = await listarOrdenesDelTablero();
      if (!montado.current) return;
      setOrdenes(datos);
      setError('');
      setUltimaActualizacion(new Date());
    } catch {
      if (!montado.current) return;
      setError('No se pudieron cargar las órdenes. Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      if (montado.current) {
        setCargando(false);
        setActualizando(false);
      }
    }
  }, []);

  const refrescar = useCallback(() => cargar({ silencioso: true }), [cargar]);

  // Realtime puede emitir varios eventos seguidos (por ejemplo, una orden y sus
  // servicios). Un único refresco diferido evita consultas innecesarias.
  const programarRefresco = useCallback(() => {
    if (!montado.current) return;
    if (esperaRefresco.current) clearTimeout(esperaRefresco.current);
    esperaRefresco.current = setTimeout(() => cargar({ silencioso: true }), ESPERA_REFRESCO_MS);
  }, [cargar]);

  /** Recuperación manual: recarga los datos y vuelve a abrir la suscripción. */
  const reintentar = useCallback(() => {
    setError('');
    setErrorConexion('');
    setCargando(true);
    setIntento((numero) => numero + 1);
  }, []);

  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
      if (esperaRefresco.current) clearTimeout(esperaRefresco.current);
    };
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar, intento]);

  useEffect(() => {
    let cancelado = false;
    // Si la conexión se cayó y Realtime logra reconectar solo, hay que recuperar
    // los eventos que se perdieron mientras estuvo desconectado.
    let huboError = false;

    // El filtro por establecimiento es defensa en profundidad: aunque el
    // servidor de Realtime ya aplica RLS por suscriptor, así solo llega el
    // tráfico del tenant y nunca se mezclan eventos entre establecimientos.
    const filtro = establecimientoId
      ? { filter: `establecimiento_id=eq.${establecimientoId}` }
      : {};
    const nombre = [
      'ordenes-dashboard',
      establecimientoId ?? 'sin-tenant',
      Date.now(),
      Math.random().toString(36).slice(2, 8),
    ].join('-');

    setConectado(false);
    setErrorConexion('');

    const canal = supabase
      .channel(nombre)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ordenes', ...filtro },
        programarRefresco,
      )
      .subscribe((estadoCanal) => {
        if (cancelado) return;
        if (estadoCanal === 'SUBSCRIBED') {
          setConectado(true);
          setErrorConexion('');
          if (huboError) {
            huboError = false;
            programarRefresco();
          }
          return;
        }
        if (estadoCanal === 'CHANNEL_ERROR' || estadoCanal === 'TIMED_OUT') {
          huboError = true;
          setConectado(false);
          setErrorConexion(
            'Se perdió la conexión en tiempo real. Puedes reconectar para volver a sincronizar el tablero.',
          );
        }
      });

    return () => {
      cancelado = true;
      supabase.removeChannel(canal);
    };
  }, [establecimientoId, intento, programarRefresco]);

  // Si el equipo vuelve a estar en línea o la pestaña vuelve a primer plano,
  // se recupera la información aunque Realtime no haya podido reconectar.
  useEffect(() => {
    const alVolverALaPestana = () => {
      if (document.visibilityState === 'visible') refrescar();
    };
    const alRecuperarLaRed = () => reintentar();

    document.addEventListener('visibilitychange', alVolverALaPestana);
    window.addEventListener('online', alRecuperarLaRed);
    return () => {
      document.removeEventListener('visibilitychange', alVolverALaPestana);
      window.removeEventListener('online', alRecuperarLaRed);
    };
  }, [refrescar, reintentar]);

  return {
    ordenes,
    cargando,
    actualizando,
    error,
    errorConexion,
    conectado,
    ultimaActualizacion,
    refrescar,
    reintentar,
  };
}
