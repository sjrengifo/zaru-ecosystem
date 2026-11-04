// Hook: rol del usuario actual, para mostrar solo las acciones que puede usar. La API sigue siendo quien decide.
// HU-59: usa el perfil que RutaProtegida ya consultó; solo pide /me si se usa fuera de ella.
import { useEffect, useState } from 'react';
import { api } from '../services/api.js';
import { usePerfil } from './usePerfil.js';

export function useRol() {
  const perfil = usePerfil();
  const [rol, setRol] = useState(perfil?.rol ?? null);

  useEffect(() => {
    if (perfil) {
      setRol(perfil.rol);
      return undefined;
    }
    let vigente = true;
    api
      .get('/me')
      .then((datos) => vigente && setRol(datos.usuario.rol))
      .catch(() => {}); // Sin rol no se muestran las acciones restringidas.
    return () => {
      vigente = false;
    };
  }, [perfil]);

  return rol;
}
