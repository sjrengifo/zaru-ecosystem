
// HU-01 · Iniciar sesión en el panel administrativo (ZARU-2)
import { useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useSesion } from '../hooks/useSesion.js';
import { validarCorreo } from '../lib/validacionCorreo.js';
import { destinoTrasLogin } from '../lib/rutas.js';

export default function Login() {
  const { sesion, usuario, cargando, errorSesion, recargar, recuperacion } = useSesion();
  const ubicacion = useLocation();

  const [correo, setCorreo] = useState('');
  const [clave, setClave] = useState('');

  const [error, setError] = useState(() => {
    try {
      if (sessionStorage.getItem('zaru:sesion-revocada')) {
        sessionStorage.removeItem('zaru:sesion-revocada');
        return 'Tu cuenta ya no tiene acceso al panel. Contacta al administrador.';
      }
      if (sessionStorage.getItem('zaru:sesion-vencida')) {
        sessionStorage.removeItem('zaru:sesion-vencida');
        return 'Tu sesión venció. Inicia sesión de nuevo.';
      }
    } catch {
      // Sin sessionStorage no se muestra el aviso.
    }
    return '';
  });

  const [enviando, setEnviando] = useState(false);

  // Recupera la ruta privada que el usuario intentó abrir, pero solo si su rol puede verla: la ruta
  // guardada puede ser de otra sesión (p. ej. /superadmin) y daría un aviso de acceso denegado.
  const destino = usuario ? destinoTrasLogin(usuario.rol, ubicacion.state?.desde) : '/';

  // Una sesión de recuperación solo puede ir a cambiar la contraseña.
  if (sesion && recuperacion) {
    return <Navigate to="/restablecer" replace />;
  }

  // Si ya existe una sesión validada, no se vuelve a pedir login.
  if (sesion && !cargando) {
    return <Navigate to={destino} replace />;
  }

  async function iniciarSesion(e) {
    e.preventDefault();

    if (enviando) return;

    const correoNormalizado = correo.trim().toLowerCase();

    if (!correoNormalizado || !clave) {
      setError('Completa el correo y la contraseña');
      return;
    }

    const mensajeCorreo = validarCorreo(correoNormalizado);

    if (mensajeCorreo) {
      setError(mensajeCorreo);
      return;
    }

    setError('');
    setEnviando(true);

    try {
      const { error: errorAuth } = await supabase.auth.signInWithPassword({
        email: correoNormalizado,
        password: clave,
      });

      if (errorAuth) {
        setError('Correo o contraseña incorrectos');
        return;
      }

      // Valida el perfil y los permisos mediante el contexto de sesión.
      await recargar();
    } catch (err) {
      console.error('Error al iniciar sesión:', err);
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

        <button
          className="boton"
          type="submit"
          disabled={enviando || cargando}
          aria-busy={enviando}
        >
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
