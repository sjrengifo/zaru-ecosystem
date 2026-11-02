// HU-01 — Estado único de la sesión del panel.
// Centraliza auth de Supabase + validación del perfil contra el backend,
// para que Login, RutaProtegida y Layout no dupliquen consultas.
import { createContext, useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { api } from '../services/api.js';

export const SesionContext = createContext({
  sesion: null,
  usuario: null,
  establecimiento: null,
  cargando: true,
  errorSesion: '',
  recargar: async () => false,
});

export function SesionProvider({ children }) {
  const [sesion, setSesion] = useState(null);
  const [usuario, setUsuario] = useState(null);
  const [establecimiento, setEstablecimiento] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [errorSesion, setErrorSesion] = useState('');
  const montado = useRef(true);

  // Valida la sesión contra el backend y resuelve perfil + establecimiento.
  // Devuelve false cuando la cuenta no tiene acceso (token inválido o perfil inactivo).
  const validarAcceso = useCallback(async (sesionActual) => {
    if (!sesionActual) {
      if (montado.current) {
        setUsuario(null);
        setEstablecimiento(null);
        setCargando(false);
      }
      return false;
    }

    if (montado.current) {
      setCargando(true);
      setErrorSesion('');
    }

    try {
      const datos = await api.get('/me');
      if (!montado.current) return true;
      setUsuario(datos.usuario);
      setEstablecimiento(datos.establecimiento);
      return true;
    } catch (err) {
      // 401/403: token vencido, perfil inexistente o cuenta desactivada.
      if (err.status === 401 || err.status === 403) {
        await supabase.auth.signOut().catch(() => {});
        if (montado.current) {
          setSesion(null);
          setUsuario(null);
          setEstablecimiento(null);
          setErrorSesion('Tu cuenta no tiene acceso al panel. Contacta al administrador.');
        }
        return false;
      }

      // Caída de red o de la API: no cerramos la sesión; RLS sigue protegiendo los datos.
      if (montado.current) {
        setUsuario(null);
        setEstablecimiento(null);
        setErrorSesion('No se pudo validar la sesión con el servidor. Revisa tu conexión.');
      }
      return true;
    } finally {
      if (montado.current) setCargando(false);
    }
  }, []);

  const aplicarSesion = useCallback(
    async (nuevaSesion) => {
      if (!montado.current) return;
      setSesion(nuevaSesion ?? null);
      await validarAcceso(nuevaSesion ?? null);
    },
    [validarAcceso]
  );

  const recargar = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const actual = data.session ?? null;
    if (montado.current) setSesion(actual);
    return validarAcceso(actual);
  }, [validarAcceso]);

  useEffect(() => {
    montado.current = true;

    const { data: escucha } = supabase.auth.onAuthStateChange((evento, nuevaSesion) => {
      // Refrescar el token no cambia el usuario: evita repetir la consulta.
      if (evento === 'TOKEN_REFRESHED') {
        setSesion(nuevaSesion ?? null);
        return;
      }
      // La carga inicial la resuelve getSession() para no duplicar /me.
      // Se difiere la validación para no llamar a Supabase dentro del callback de auth
      // (Supabase mantiene un bloqueo interno durante la notificación).
      if (evento === 'SIGNED_IN' || evento === 'SIGNED_OUT') {
        setTimeout(() => {
          aplicarSesion(nuevaSesion ?? null);
        }, 0);
      }
    });

    supabase.auth.getSession().then(({ data }) => aplicarSesion(data.session ?? null));

    return () => {
      montado.current = false;
      escucha.subscription.unsubscribe();
    };
  }, [aplicarSesion]);

  return (
    <SesionContext.Provider
      value={{ sesion, usuario, establecimiento, cargando, errorSesion, recargar }}
    >
      {children}
    </SesionContext.Provider>
  );
}
