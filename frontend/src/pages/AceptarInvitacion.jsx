
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { api } from '../services/api.js';
import MarcoAuth from '../components/MarcoAuth.jsx';
import MarcaZaru from '../components/MarcaZaru.jsx';

export default function AceptarInvitacion() {
  const navegar = useNavigate();
  const [clave, setClave] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  async function establecerClave(e) {
    e.preventDefault();
    setError('');

    if (clave.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }

    if (clave !== confirmacion) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setCargando(true);

    try {
      const { data: sesion } = await supabase.auth.getSession();

      if (!sesion.session) {
        throw new Error('La invitación no es válida o ha expirado. Solicita una nueva invitación.');
      }

      const { error: errorClave } = await supabase.auth.updateUser({
        password: clave,
      });

      if (errorClave) throw errorClave;

      // Verificamos que el perfil y el establecimiento permitan el acceso.
      await api.get('/me');

      navegar('/', { replace: true });
    } catch (e) {
      setError(e.message || 'No fue posible completar la invitación.');
    } finally {
      setCargando(false);
    }
  }

  return (
    <MarcoAuth>
      <form className="login-form" onSubmit={establecerClave}>
        <h1 className="logo">
          <MarcaZaru tamano={34} gota={false} />
        </h1>
        <h2>Activa tu cuenta</h2>
        <p className="texto-suave">
          Establece una contraseña para ingresar al panel de tu establecimiento.
        </p>

        <label>
          Nueva contraseña
          <input
            type="password"
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            minLength={8}
            required
          />
        </label>

        <label>
          Confirmar contraseña
          <input
            type="password"
            value={confirmacion}
            onChange={(e) => setConfirmacion(e.target.value)}
            minLength={8}
            required
          />
        </label>

        {error && <p className="error" role="alert">{error}</p>}

        <button className="boton" disabled={cargando}>
          {cargando ? 'Activando cuenta…' : 'Establecer contraseña'}
        </button>
      </form>
    </MarcoAuth>
  );
}
