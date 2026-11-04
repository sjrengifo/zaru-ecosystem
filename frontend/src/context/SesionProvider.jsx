// HU-01 — Estado único de la sesión del panel.
// Centraliza auth de Supabase + validación del perfil contra el backend,
// para que Login, RutaProtegida y Layout no dupliquen consultas.
// HU-14: distingue la sesión temporal de recuperación de una sesión normal.
import { createContext, useCallback, useEffect, useRef, useState } from 'react';
import {
  enlaceAuth,
  hayRecuperacionGuardada,
  limpiarRecuperacion,
  marcarRecuperacion,
} from '../lib/enlaceAuth.js';
import { supabase } from '../lib/supabase.js';
import { api } from '../services/api.js';

export const SesionContext = createContext({
  sesion: null,
  usuario: null,
  establecimiento: null,
  cargando: true,
  errorSesion: '',
  recuperacion: false,
  recargar: async () => false,
  finalizarRecuperacion: async () => {},
});

export function SesionProvider({ children }) {
  const [sesion, setSesion] = useState(null);
  const [usuario, setUsuario] = useState(null);
  const [establecimiento, setEstablecimiento] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [errorSesion, setErrorSesion] = useState('');
  // HU-14: el enlace válido llega como #type=recovery; el vencido, como #error_code=...
  // La marca sobrevive recargas y pestañas para que la sesión temporal de
  // recuperación no se confunda con una sesión normal.
  const [recuperacion, setRecuperacion] = useState(() => {
    if (enlaceAuth.recuperacion) {
      marcarRecuperacion();
      return true;
    }
    return hayRecuperacionGuardada();
  });
  const recuperacionRef = useRef(recuperacion);
  const montado = useRef(true);

  // Valida la sesión contra el backend y resuelve perfil + establecimiento.
  // Devuelve false cuando la cuenta no tiene acceso (token inválido o perfil inactivo).
  const validarAcceso = useCallback(async (sesionActual) => {
    if (!sesionActual) {
      // HU-14: si no hay sesión, una marca de recuperación quedó huérfana
      // (enlace vencido o ya usado): se descarta para no bloquear el login.
      if (recuperacionRef.current) {
        recuperacionRef.current = false;
        limpiarRecuperacion();
        if (montado.current) setRecuperacion(false);
      }
      if (montado.current) {
        setUsuario(null);
        setEstablecimiento(null);
        setCargando(false);
      }
      return false;
    }

    // HU-14: la sesión de recuperación solo sirve para cambiar la contraseña.
    // No se valida /me ni se carga el panel con ella.
    if (recuperacionRef.current) {
      if (montado.current) {
        setUsuario(null);
        setEstablecimiento(null);
        setErrorSesion('');
        setCargando(false);
      }
      return true;
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
    if (recuperacionRef.current) {
      if (montado.current) setCargando(false);
      return true;
    }
    return validarAcceso(actual);
  }, [validarAcceso]);

  // HU-14: cierra la sesión temporal y limpia la marca al terminar o cancelar.
  const finalizarRecuperacion = useCallback(async () => {
    limpiarRecuperacion();
    recuperacionRef.current = false;
    setRecuperacion(false);
    setSesion(null);
    setUsuario(null);
    setEstablecimiento(null);
    setErrorSesion('');
    setCargando(false);
    await supabase.auth.signOut().catch(() => {});
  }, []);

  useEffect(() => {
    montado.current = true;

    const { data: escucha } = supabase.auth.onAuthStateChange((evento, nuevaSesion) => {
      // HU-14: Supabase avisa con PASSWORD_RECOVERY cuando el enlace es válido.
      if (evento === 'PASSWORD_RECOVERY') {
        recuperacionRef.current = true;
        marcarRecuperacion();
        setRecuperacion(true);
        setSesion(nuevaSesion ?? null);
        setUsuario(null);
        setEstablecimiento(null);
        setErrorSesion('');
        setCargando(false);
        return;
      }

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
      value={{
        sesion,
        usuario,
        establecimiento,
        cargando,
        errorSesion,
        recuperacion,
        recargar,
        finalizarRecuperacion,
      }}
    >
      {children}
    </SesionContext.Provider>
  );
}
