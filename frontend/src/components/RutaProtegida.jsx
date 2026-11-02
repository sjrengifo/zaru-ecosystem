// Si no hay sesión, manda al login (HU-01).
import { Navigate, useLocation } from 'react-router-dom';
import { useSesion } from '../hooks/useSesion.js';

export default function RutaProtegida({ children }) {
  const { sesion, cargando } = useSesion();
  const ubicacion = useLocation();

  if (cargando) return <p className="centrado">Cargando…</p>;
  if (!sesion) return <Navigate to="/login" replace state={{ desde: ubicacion.pathname }} />;
  return children;
}
