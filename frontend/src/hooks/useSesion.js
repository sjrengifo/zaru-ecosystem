// Hook: devuelve la sesión actual y se actualiza al entrar o salir.
// Uso:  const { sesion, cargando } = useSesion();
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';

export function useSesion() {
  const [sesion, setSesion] = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSesion(data.session);
      setCargando(false);
    });

    const { data } = supabase.auth.onAuthStateChange((_evento, nuevaSesion) => {
      setSesion(nuevaSesion);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  return { sesion, cargando };
}
