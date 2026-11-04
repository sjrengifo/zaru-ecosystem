// Páginas privadas: exigen sesión, consultan el perfil una vez (GET /me) y lo comparten (usePerfil).
// HU-59 CA3: si el rol no corresponde, la página no se muestra y el usuario vuelve a su inicio con un aviso.
import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useSesion } from '../hooks/useSesion.js';
import { PerfilContext, usePerfil } from '../hooks/usePerfil.js';
import { inicioDe, puedeVer } from '../lib/permisos.js';
import { api } from '../services/api.js';

export default function RutaProtegida({ children, roles = ['admin', 'operario'] }) {
  const { sesion, cargando } = useSesion();
  const { pathname } = useLocation();
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
      .then((datos) => { if (vigente) setPerfil({ ...datos.usuario, permisos: datos.permisos }); })
      .catch((e) => { if (vigente) setError(e.message); })
      .finally(() => { if (vigente) setConsultando(false); });
    return () => { vigente = false; };
  }, [sesion?.access_token]);

  if (cargando || (sesion && consultando)) return <p className="centrado">Cargando…</p>;
  if (!sesion) return <Navigate to="/login" replace />;
  if (error || !perfil) return <div className="login"><div className="tarjeta"><h2>Acceso no disponible</h2><p>{error || 'No se pudo validar tu perfil.'}</p><a href="/login">Volver al inicio de sesión</a></div></div>;
  if (!roles.includes(perfil.rol)) return <Navigate to={inicioDe(perfil)} replace state={{ accesoDenegado: pathname }} />;
  return <PerfilContext.Provider value={perfil}>{children}</PerfilContext.Provider>;
}

/**
 * HU-59: envuelve la página de un módulo. Si el rol no lo tiene (p. ej. el operario escribe
 * /promociones a mano), redirige a su página de inicio y el Layout muestra el aviso.
 *   <Route path="/promociones" element={<RequiereModulo modulo="promociones"><Promociones /></RequiereModulo>} />
 */
export function RequiereModulo({ modulo, children }) {
  const perfil = usePerfil();
  const { pathname } = useLocation();
  if (!perfil) return null;
  if (!puedeVer(perfil, modulo)) {
    const inicio = inicioDe(perfil);
    // Si su propio inicio fuera el módulo bloqueado, evita un ciclo de redirecciones.
    return inicio === pathname ? <p className="aviso aviso-error">No tienes acceso a esta sección.</p>
      : <Navigate to={inicio} replace state={{ accesoDenegado: pathname }} />;
  }
  return children;
}
