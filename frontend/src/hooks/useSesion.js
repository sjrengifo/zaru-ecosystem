// Hook: devuelve la sesión actual, el perfil y el establecimiento del usuario.
// Uso:  const { sesion, usuario, establecimiento, cargando, recuperacion } = useSesion();
import { useContext } from 'react';
import { SesionContext } from '../context/SesionProvider.jsx';

export function useSesion() {
  return useContext(SesionContext);
}
