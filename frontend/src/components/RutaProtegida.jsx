// Si no hay sesión, manda al login (HU-01).
// HU-14: una sesión de recuperación no da acceso al panel; solo al cambio de contraseña.
// HU-57: cada ruta indica qué roles la pueden abrir; el superadmin va a su propio panel.
import { Navigate, useLocation } from 'react-router-dom';
import { useSesion } from '../hooks/useSesion.js';

export default function RutaProtegida({ children, roles = ['admin', 'operario'] }) {
  const { sesion, usuario, cargando, errorSesion, recuperacion } = useSesion();
  const ubicacion = useLocation();

  if (cargando) return <p className="centrado">Cargando…</p>;
  if (recuperacion) return <Navigate to="/restablecer" replace />;
  if (!sesion) return <Navigate to="/login" replace state={{ desde: ubicacion.pathname }} />;
  if (!usuario) return <div className="login"><div className="tarjeta"><h2>Acceso no disponible</h2><p>{errorSesion || 'No se pudo validar tu perfil.'}</p><a href="/login">Volver al inicio de sesión</a></div></div>;
  if (!roles.includes(usuario.rol)) return <Navigate to={usuario.rol === 'superadmin' ? '/superadmin' : '/'} replace />;
  return children;
}
