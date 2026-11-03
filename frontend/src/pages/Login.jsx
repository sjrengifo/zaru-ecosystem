// HU-01 · Iniciar sesión en el panel administrativo (ZARU-2)
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { api } from '../services/api.js';

export default function Login() {
  const navegar = useNavigate();
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

  async function iniciarSesion(e) {
    e.preventDefault();
    setError('');
    setEnviando(true);
    const { error: errorAuth } = await supabase.auth.signInWithPassword({ email: correo, password: clave });
    if (errorAuth) {
      setEnviando(false);
      return setError('Correo o contraseña incorrectos');
    }
    try {
      const perfil = await api.get('/me');
      navegar(perfil.usuario.rol === 'superadmin' ? '/superadmin' : '/');
    } catch {
      await supabase.auth.signOut({ scope: 'local' });
      setError('Tu usuario no tiene acceso habilitado. Si pertenece a un establecimiento, verifica su estado con el administrador.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="login">
      <form className="tarjeta login-form" onSubmit={iniciarSesion}>
        <h1 className="logo">Zaru</h1>
        <p className="texto-suave">Panel administrativo</p>

        <label>
          Correo
          <input type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} required />
        </label>
        <label>
          Contraseña
          <input type="password" value={clave} onChange={(e) => setClave(e.target.value)} required />
        </label>

        {error && <p className="error">{error}</p>}

        <button className="boton" disabled={enviando}>
          {enviando ? 'Entrando…' : 'Iniciar sesión'}
        </button>
      </form>
    </div>
  );
}
