// HU-01 · Iniciar sesión en el panel administrativo (ZARU-2)
import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useSesion } from '../hooks/useSesion.js';

export default function Login() {
  const navegar = useNavigate();
  const { sesion } = useSesion();
  const [correo, setCorreo] = useState('');
  const [clave, setClave] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  if (sesion) return <Navigate to="/" replace />;

  async function iniciarSesion(e) {
    e.preventDefault();
    setError('');
    setEnviando(true);
    const { error } = await supabase.auth.signInWithPassword({ email: correo, password: clave });
    setEnviando(false);

    // CA2: mensaje genérico, sin decir qué dato falló.
    if (error) return setError('Correo o contraseña incorrectos');
    navegar('/'); // CA1: lleva al dashboard
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
