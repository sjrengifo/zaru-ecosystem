// HU-14 · Crear una nueva contraseña desde el enlace de recuperación (CA3).
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import CampoTexto from '../components/CampoTexto.jsx';
import { useSesion } from '../hooks/useSesion.js';
import { REGLAS_CONTRASENA, validarContrasena } from '../lib/contrasena.js';
import { enlaceAuth } from '../lib/enlaceAuth.js';
import { supabase } from '../lib/supabase.js';

// El enlace vence o ya fue usado cuando Supabase ya no reconoce la sesión temporal.
function esEnlaceCaido(error) {
  const codigo = error?.code || '';
  const mensaje = (error?.message || '').toLowerCase();
  return (
    codigo === 'session_not_found' ||
    codigo === 'session_expired' ||
    codigo === 'refresh_token_not_found' ||
    mensaje.includes('auth session missing') ||
    mensaje.includes('session missing') ||
    mensaje.includes('session_not_found')
  );
}

function Tarjeta({ children }) {
  return (
    <div className="login">
      <div className="tarjeta login-form auth-form">
        <h1 className="logo">Zaru</h1>
        <p className="texto-suave">Panel administrativo</p>
        {children}
      </div>
    </div>
  );
}

export default function RestablecerContrasena() {
  const { sesion, cargando, recuperacion, finalizarRecuperacion } = useSesion();
  const navigate = useNavigate();
  // Un enlace vencido o usado llega con #error_code=... y sin sesión.
  const [invalido, setInvalido] = useState(() => Boolean(enlaceAuth.errorCodigo));
  const [exito, setExito] = useState(false);
  const [clave, setClave] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [errores, setErrores] = useState({});
  const [errorGeneral, setErrorGeneral] = useState('');
  const [enviando, setEnviando] = useState(false);

  const enlaceListo = !invalido && recuperacion && Boolean(sesion);

  async function guardar(e) {
    e.preventDefault();
    if (enviando || !enlaceListo) return;

    const nuevos = {};
    const mensajeClave = validarContrasena(clave);
    if (mensajeClave) nuevos.clave = mensajeClave;
    if (!confirmacion) nuevos.confirmacion = 'Confirma la nueva contraseña';
    else if (confirmacion !== clave) nuevos.confirmacion = 'Las contraseñas no coinciden';

    if (Object.keys(nuevos).length) {
      setErrores(nuevos);
      setErrorGeneral('');
      return;
    }

    setErrores({});
    setErrorGeneral('');
    setEnviando(true);

    try {
      const { error } = await supabase.auth.updateUser({ password: clave });

      if (error) {
        if (esEnlaceCaido(error)) {
          // El enlace venció o ya se usó entre la apertura y el guardado.
          setInvalido(true);
          await finalizarRecuperacion();
          return;
        }
        if (error.code === 'same_password') {
          setErrores({ clave: 'La nueva contraseña debe ser diferente a la anterior' });
          return;
        }
        if (error.code === 'weak_password') {
          setErrores({ clave: 'La contraseña no cumple la política de seguridad del sistema' });
          return;
        }
        setErrorGeneral('No se pudo actualizar la contraseña. Intenta de nuevo.');
        return;
      }

      // La sesión de recuperación ya cumplió su función: se cierra y se
      // vuelve a pedir login con la contraseña nueva.
      setExito(true);
      await finalizarRecuperacion();
    } catch {
      setErrorGeneral('No se pudo conectar con el servidor. Intenta de nuevo.');
    } finally {
      setEnviando(false);
    }
  }

  async function cancelar() {
    await finalizarRecuperacion();
    navigate('/login', { replace: true });
  }

  if (exito) {
    return (
      <Tarjeta>
        <h2 className="auth-titulo">Contraseña actualizada</h2>
        <div className="aviso aviso-exito" role="status" aria-live="polite">
          <p>Tu contraseña se actualizó correctamente.</p>
          <p>Ya puedes iniciar sesión con la nueva contraseña.</p>
        </div>
        <Link className="boton boton-enlace" to="/login">
          Ir al inicio de sesión
        </Link>
      </Tarjeta>
    );
  }

  if (invalido || (!cargando && !enlaceListo)) {
    return (
      <Tarjeta>
        <h2 className="auth-titulo">Enlace no válido</h2>
        <div className="aviso aviso-error" role="alert">
          <p>
            <strong>El enlace ya no es válido.</strong>
          </p>
          <p>
            Puede haber vencido o haberse utilizado antes. Los enlaces de recuperación tienen
            vigencia limitada y solo pueden usarse una vez. Solicita uno nuevo para continuar.
          </p>
        </div>
        <Link className="boton boton-enlace" to="/recuperar">
          Solicitar un nuevo enlace
        </Link>
        {recuperacion ? (
          <button type="button" className="enlace-accion auth-enlace" onClick={cancelar}>
            Cerrar sesión y volver al inicio
          </button>
        ) : (
          <Link className="enlace-accion auth-enlace" to="/login">
            Volver al inicio de sesión
          </Link>
        )}
      </Tarjeta>
    );
  }

  if (cargando) {
    return (
      <Tarjeta>
        <h2 className="auth-titulo">Nueva contraseña</h2>
        <p className="texto-suave auth-intro" role="status" aria-live="polite">
          Validando el enlace de recuperación…
        </p>
      </Tarjeta>
    );
  }

  return (
    <Tarjeta>
      <h2 className="auth-titulo">Nueva contraseña</h2>
      <form onSubmit={guardar} noValidate>
        <p className="auth-intro">
          Elige una contraseña nueva para tu cuenta. {REGLAS_CONTRASENA}
        </p>

        <CampoTexto
          id="clave-nueva"
          etiqueta="Nueva contraseña"
          obligatorio
          type="password"
          value={clave}
          onChange={(e) => setClave(e.target.value)}
          autoComplete="new-password"
          autoFocus
          disabled={enviando}
          error={errores.clave}
        />

        <CampoTexto
          id="clave-confirmacion"
          etiqueta="Confirmar contraseña"
          obligatorio
          type="password"
          value={confirmacion}
          onChange={(e) => setConfirmacion(e.target.value)}
          autoComplete="new-password"
          disabled={enviando}
          error={errores.confirmacion}
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
              Guardando…
            </>
          ) : (
            'Guardar contraseña'
          )}
        </button>

        <button type="button" className="enlace-accion auth-enlace" onClick={cancelar} disabled={enviando}>
          Cancelar y volver al inicio de sesión
        </button>
      </form>
    </Tarjeta>
  );
}
