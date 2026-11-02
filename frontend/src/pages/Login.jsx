// HU-01 · Iniciar sesión en el panel administrativo (ZARU-2)
import { useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useSesion } from '../hooks/useSesion.js';
import { validarCorreo } from '../lib/validacionCorreo.js';

export default function Login() {
  const { sesion, cargando, errorSesion, recargar, recuperacion } = useSesion();
  const ubicacion = useLocation();
  const [correo, setCorreo] = useState('');
  const [clave, setClave] = useState('');
  // HU-44 CA3: si el backend rechazó un token vencido, se explica por qué se volvió al login.
  const [error, setError] = useState(() => {
    try {
      if (sessionStorage.getItem('zaru:sesion-vencida')) {
        sessionStorage.removeItem('zaru:sesion-vencida');
        return 'Tu sesión venció. Inicia sesión de nuevo.';
      }
    } catch {
      // sin sessionStorage no hay aviso
    }
    return '';
  });
  const [enviando, setEnviando] = useState(false);

  // Vuelve a la ruta privada que el usuario intentó abrir, o al dashboard.
  const destino =
    ubicacion.state?.desde && ubicacion.state.desde !== '/login' ? ubicacion.state.desde : '/';

  // HU-14: una sesión de recuperación solo puede ir a cambiar la contraseña.
  if (sesion && recuperacion) return <Navigate to="/restablecer" replace />;

  // Si ya hay sesión validada, no se vuelve a pedir login (HU-01, req. 3).
  if (sesion && !cargando) return <Navigate to={destino} replace />;

  async function iniciarSesion(e) {
    e.preventDefault();
    if (enviando) return;

    const correoNormalizado = correo.trim().toLowerCase();

    // Validación de campos obligatorios (req. 1).
    if (!correoNormalizado || !clave) {
      return setError('Completa el correo y la contraseña');
    }
    const mensajeCorreo = validarCorreo(correoNormalizado);
    if (mensajeCorreo) {
      return setError(mensajeCorreo);
    }

    setError('');
    setEnviando(true);

    try {
      const { error: errorAuth } = await supabase.auth.signInWithPassword({
        email: correoNormalizado,
        password: clave,
      });

      if (errorAuth) {
        // CA2: mensaje genérico, sin revelar si falló el correo o la contraseña.
        setError('Correo o contraseña incorrectos');
        return;
      }

      // CA1 + CA3: valida contra el backend que el perfil exista, esté activo
      // y pertenezca a un establecimiento. Si no, el contexto cierra la sesión.
      await recargar();
    } catch {
      setError('No se pudo conectar con el servidor. Intenta de nuevo.');
    } finally {
      setEnviando(false);
    }
  }

  const mensajeError = error || errorSesion;

  return (
    <div className="login">
      <form className="tarjeta login-form" onSubmit={iniciarSesion} noValidate>
        <h1 className="logo">Zaru</h1>
        <p className="texto-suave">Panel administrativo</p>

        <label htmlFor="correo">Correo</label>
        <input
          id="correo"
          type="email"
          value={correo}
          onChange={(e) => setCorreo(e.target.value)}
          autoComplete="email"
          autoFocus
          disabled={enviando}
          required
        />

        <label htmlFor="clave">Contraseña</label>
        <input
          id="clave"
          type="password"
          value={clave}
          onChange={(e) => setClave(e.target.value)}
          autoComplete="current-password"
          disabled={enviando}
          required
        />

        <Link className="login-olvido" to="/recuperar">
          ¿Olvidaste tu contraseña?
        </Link>

        {mensajeError && (
          <p className="error" role="alert" aria-live="polite">
            {mensajeError}
          </p>
        )}

        <button className="boton" type="submit" disabled={enviando} aria-busy={enviando}>
          {enviando ? (
            <>
              <span className="spinner" aria-hidden="true" />
              Entrando…
            </>
          ) : (
            'Iniciar sesión'
          )}
        </button>
      </form>
    </div>
  );
}
