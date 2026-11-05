// HU-14 · Solicitar el enlace de recuperación de contraseña (CA1 y CA2).
import { useState } from 'react';
import { Link } from 'react-router-dom';
import CampoTexto from '../components/CampoTexto.jsx';
import { supabase } from '../lib/supabase.js';
import { normalizarCorreo, validarCorreo } from '../lib/validacionCorreo.js';
import MarcoAuth from '../components/MarcoAuth.jsx';
import MarcaZaru from '../components/MarcaZaru.jsx';

export default function RecuperarContrasena() {
  const [correo, setCorreo] = useState('');
  const [errorCorreo, setErrorCorreo] = useState('');
  const [errorGeneral, setErrorGeneral] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  async function solicitarEnlace(e) {
    e.preventDefault();
    if (enviando) return;

    const mensajeCorreo = validarCorreo(correo);
    if (mensajeCorreo) {
      setErrorCorreo(mensajeCorreo);
      setErrorGeneral('');
      return;
    }

    setErrorCorreo('');
    setErrorGeneral('');
    setEnviando(true);

    try {
      // CA2: Supabase responde igual exista o no la cuenta, así que el mensaje
      // de confirmación es genérico y no se muestra ningún detalle del correo.
      const { error } = await supabase.auth.resetPasswordForEmail(normalizarCorreo(correo), {
        redirectTo: `${window.location.origin}/restablecer`,
      });

      if (error) {
        // CA2: si el proyecto tiene desactivada la protección de enumeración,
        // Supabase podría responder "no existe". Se muestra el mismo éxito.
        if (error.code === 'user_not_found' || error.code === 'email_not_found') {
          if (import.meta.env.DEV) {
            console.warn('HU-14: correo no registrado; se muestra el mensaje genérico.');
          }
          setEnviado(true);
          return;
        }
        // Un fallo técnico (red, límite de envíos) tampoco revela si la cuenta existe.
        setErrorGeneral(
          'No se pudo procesar la solicitud en este momento. Espera un momento e intenta de nuevo.'
        );
        return;
      }

      setEnviado(true);
    } catch {
      setErrorGeneral('No se pudo conectar con el servidor. Intenta de nuevo.');
    } finally {
      setEnviando(false);
    }
  }

  function usarOtroCorreo() {
    setCorreo('');
    setErrorCorreo('');
    setErrorGeneral('');
    setEnviado(false);
  }

  return (
    <MarcoAuth>
      <div className="login-form auth-form">
        <h1 className="logo">
          <MarcaZaru tamano={34} />
        </h1>
        <h2 className="auth-titulo">Recuperar contraseña</h2>

        {enviado ? (
          <>
            <div className="aviso aviso-exito" role="status" aria-live="polite">
              <p>
                Si el correo está registrado, recibirás un enlace para restablecer tu contraseña.
              </p>
              <p>
                Revisa también la carpeta de spam. El enlace tiene vigencia limitada y solo puede
                usarse una vez.
              </p>
            </div>

            <Link className="boton boton-enlace" to="/login">
              Volver al inicio de sesión
            </Link>
            <button type="button" className="enlace-accion auth-enlace" onClick={usarOtroCorreo}>
              Usar otro correo
            </button>
          </>
        ) : (
          <form onSubmit={solicitarEnlace} noValidate>
            <p className="auth-intro">
              Escribe el correo con el que te registraste y te enviaremos un enlace para crear una
              nueva contraseña.
            </p>

            <CampoTexto
              id="correo-recuperacion"
              etiqueta="Correo"
              obligatorio
              type="email"
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
              autoComplete="email"
              inputMode="email"
              autoFocus
              disabled={enviando}
              error={errorCorreo}
            />

            {errorGeneral && (
              <div className="aviso aviso-error" role="alert" aria-live="polite">
                <p>{errorGeneral}</p>
              </div>
            )}

            <button className="boton" type="submit" disabled={enviando} aria-busy={enviando}>
              {enviando ? (
                <>
                  <span className="spinner" aria-hidden="true" />
                  Enviando…
                </>
              ) : (
                'Enviar enlace'
              )}
            </button>

            <Link className="enlace-accion auth-enlace" to="/login">
              Volver al inicio de sesión
            </Link>
          </form>
        )}
      </div>
    </MarcoAuth>
  );
}
