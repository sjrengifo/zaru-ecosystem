// Guarda de rutas del panel. Usa el perfil que ya validó SesionProvider para no
// volver a consultar /me en cada navegación ni desmontar la página al refrescar el token.
import { Navigate, useLocation } from 'react-router-dom';
import { useSesion } from '../hooks/useSesion.js';
import { rutaInicio } from '../lib/rutas.js';

export default function RutaProtegida({
  children,
  roles = ['admin', 'operario'],
}) {
  const { sesion, usuario, cargando, recuperacion, errorSesion } = useSesion();
  const ubicacion = useLocation();

  // Solo se bloquea la primera carga; una revalidación en segundo plano conserva la página.
  if (cargando && !usuario) return <p className="centrado">Cargando…</p>;

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
    return <Navigate to={rutaInicio(usuario.rol)} replace />;
  }

  return children;
}
