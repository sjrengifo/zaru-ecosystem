
import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useSesion } from '../hooks/useSesion.js';
import { api } from '../services/api.js';

export default function RutaProtegida({
  children,
  roles = ['admin', 'operario'],
}) {
  const { sesion, cargando, recuperacion } = useSesion();
  const ubicacion = useLocation();

  const [perfil, setPerfil] = useState(null);
  const [consultando, setConsultando] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let vigente = true;

    if (!sesion || recuperacion) {
      setPerfil(null);
      setConsultando(false);
      return () => {
        vigente = false;
      };
    }

    setConsultando(true);
    setError('');

    api.get('/me')
      .then((datos) => {
        if (vigente) setPerfil(datos.usuario);
      })
      .catch((e) => {
        if (vigente) setError(e.message);
      })
      .finally(() => {
        if (vigente) setConsultando(false);
      });

    return () => {
      vigente = false;
    };
  }, [sesion?.access_token, recuperacion]);

  if (cargando || (sesion && !recuperacion && consultando)) {
    return <p className="centrado">Cargando…</p>;
  }

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

  if (error || !perfil) {
    return (
      <div className="login">
        <div className="tarjeta">
          <h2>Acceso no disponible</h2>
          <p>{error || 'No se pudo validar tu perfil.'}</p>
          <a href="/login">Volver al inicio de sesión</a>
        </div>
      </div>
    );
  }

  if (!roles.includes(perfil.rol)) {
    return (
      <Navigate
        to={perfil.rol === 'superadmin' ? '/superadmin' : '/'}
        replace
      />
    );
  }

  return children;
}
