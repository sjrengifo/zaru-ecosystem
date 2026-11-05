
// HU-01 · Iniciar sesión en el panel administrativo (ZARU-2)
import { useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useSesion } from '../hooks/useSesion.js';
import { validarCorreo } from '../lib/validacionCorreo.js';
import { destinoTrasLogin } from '../lib/rutas.js';
import { ArrowRight, Eye, EyeOff, Lock, Mail } from 'lucide-react';
import MarcoAuth from '../components/MarcoAuth.jsx';
import MarcaZaru from '../components/MarcaZaru.jsx';

export default function Login() {
  const { sesion, usuario, cargando, errorSesion, recargar, recuperacion } = useSesion();
  const ubicacion = useLocation();

  const [correo, setCorreo] = useState('');
  const [clave, setClave] = useState('');
  const [verClave, setVerClave] = useState(false);

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
    <MarcoAuth>
      <form className="login-form" onSubmit={iniciarSesion} noValidate>
        <h1 className="logo">
          <MarcaZaru tamano={34} gota={false} />
        </h1>
        <h2 className="auth-titulo">Hola de nuevo</h2>
        <p className="texto-suave auth-intro">Ingresa al panel administrativo de tu lavadero.</p>

        <label htmlFor="correo">Correo</label>
        <div className="campo-control campo-con-icono">
          <Mail size={18} aria-hidden="true" />
          <input
            id="correo"
            type="email"
            value={correo}
            onChange={(e) => setCorreo(e.target.value)}
            autoComplete="email"
            placeholder="tu@correo.com"
            autoFocus
            disabled={enviando}
            required
          />
        </div>

        <label htmlFor="clave">Contraseña</label>
        <div className="campo-control campo-con-icono campo-con-boton">
          <Lock size={18} aria-hidden="true" />
          <input
            id="clave"
            type={verClave ? 'text' : 'password'}
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            autoComplete="current-password"
            disabled={enviando}
            required
          />
          <button
            type="button"
            className="boton-ver-clave"
            onClick={() => setVerClave((v) => !v)}
            aria-label={verClave ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            aria-pressed={verClave}
          >
            {verClave ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
          </button>
        </div>

        <Link className="login-olvido" to="/recuperar">
          ¿Olvidaste tu contraseña?
        </Link>

        {mensajeError && (
          <p className="error aviso aviso-error" role="alert" aria-live="polite">
            {mensajeError}
          </p>
        )}

        <button
          className="boton boton-grande"
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
            <>
              Iniciar sesión
              <ArrowRight size={18} aria-hidden="true" />
            </>
          )}
        </button>
      </form>
    </MarcoAuth>
  );
}
