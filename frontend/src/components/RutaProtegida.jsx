// Si no hay sesión, manda al login (HU-01).
// HU-14: una sesión de recuperación no da acceso al panel; solo al cambio de contraseña.
import { Navigate, useLocation } from 'react-router-dom';
import { useSesion } from '../hooks/useSesion.js';

export default function RutaProtegida({ children }) {
  const { sesion, cargando, recuperacion } = useSesion();
  const ubicacion = useLocation();

  if (cargando) return <p className="centrado">Cargando…</p>;
  if (recuperacion) return <Navigate to="/restablecer" replace />;
  if (!sesion) return <Navigate to="/login" replace state={{ desde: ubicacion.pathname }} />;
  return children;
}
