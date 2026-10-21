// Si no hay sesión, manda al login (HU-01).
import { Navigate } from 'react-router-dom';
import { useSesion } from '../hooks/useSesion.js';

export default function RutaProtegida({ children }) {
  const { sesion, cargando } = useSesion();
  if (cargando) return <p className="centrado">Cargando…</p>;
  if (!sesion) return <Navigate to="/login" replace />;
  return children;
}
