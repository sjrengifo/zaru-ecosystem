import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useSesion } from '../hooks/useSesion.js';
import { api } from '../services/api.js';

export default function RutaProtegida({ children, roles = ['admin', 'operario'] }) {
  const { sesion, cargando } = useSesion();
  const [perfil, setPerfil] = useState(null);
  const [consultando, setConsultando] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let vigente = true;
    if (!sesion) {
      setPerfil(null);
      setConsultando(false);
      return () => { vigente = false; };
    }
    setConsultando(true);
    setError('');
    api.get('/me')
      .then((datos) => { if (vigente) setPerfil(datos.usuario); })
      .catch((e) => { if (vigente) setError(e.message); })
      .finally(() => { if (vigente) setConsultando(false); });
    return () => { vigente = false; };
  }, [sesion?.access_token]);

  if (cargando || (sesion && consultando)) return <p className="centrado">Cargando…</p>;
  if (!sesion) return <Navigate to="/login" replace />;
  if (error || !perfil) return <div className="login"><div className="tarjeta"><h2>Acceso no disponible</h2><p>{error || 'No se pudo validar tu perfil.'}</p><a href="/login">Volver al inicio de sesión</a></div></div>;
  if (!roles.includes(perfil.rol)) return <Navigate to={perfil.rol === 'superadmin' ? '/superadmin' : '/'} replace />;
  return children;
}
