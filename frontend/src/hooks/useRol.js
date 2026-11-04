// Hook: rol del usuario actual, para mostrar solo las acciones que puede usar. La API sigue siendo quien decide.
import { useEffect, useState } from 'react';
import { api } from '../services/api.js';

export function useRol() {
  const [rol, setRol] = useState(null);

  useEffect(() => {
    let vigente = true;
    api
      .get('/me')
      .then((datos) => vigente && setRol(datos.usuario.rol))
      .catch(() => {}); // Sin rol no se muestran las acciones restringidas.
    return () => {
      vigente = false;
    };
  }, []);

  return rol;
}
