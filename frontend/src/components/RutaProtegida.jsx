// Guarda de rutas del panel. Usa el perfil que ya validó SesionProvider para no
// volver a consultar /me en cada navegación ni desmontar la página al refrescar el token.
import { Navigate, useLocation } from 'react-router-dom';
import { useSesion } from '../hooks/useSesion.js';
import { rutaInicio } from '../lib/rutas.js';
import { usePerfil } from '../hooks/usePerfil.js';
import { inicioDe, puedeVer } from '../lib/permisos.js';
import Cargando from './Cargando.jsx';

export default function RutaProtegida({
  children,
  roles = ['admin', 'operario'],
}) {
  const { sesion, usuario, cargando, recuperacion, errorSesion } = useSesion();
  const ubicacion = useLocation();

  // Solo se bloquea la primera carga; una revalidación en segundo plano conserva la página.
  if (cargando && !usuario) return <Cargando pantalla />;

  if (recuperacion) {
    return <Navigate to="/restablecer" replace />;
  }

  if (!sesion) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ desde: ubicacion.pathname }}
      />
    );
  }

  if (!usuario) {
    return (
      <div className="login">
        <div className="tarjeta">
          <h2>Acceso no disponible</h2>
          <p>{errorSesion || 'No se pudo validar tu perfil.'}</p>
          <a href="/login">Volver al inicio de sesión</a>
        </div>
      </div>
    );
  }

  if (!roles.includes(usuario.rol)) {
    return <Navigate to={rutaInicio(usuario.rol)} replace state={{ accesoDenegado: ubicacion.pathname }} />;
  }

  return children;
}


/** HU-59: protege también la navegación directa a módulos no permitidos para el rol. */
export function RequiereModulo({ modulo, children }) {
  const perfil = usePerfil();
  const ubicacion = useLocation();
  if (!perfil) return <Cargando pantalla />;
  if (!puedeVer(perfil, modulo)) {
    const inicio = inicioDe(perfil);
    return <Navigate to={inicio} replace state={{ accesoDenegado: ubicacion.pathname }} />;
  }
  return children;
}
