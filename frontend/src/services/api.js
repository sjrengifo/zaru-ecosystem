// Funciones para hablar con el backend.
// Uso:  const clientes = await api.get('/clientes');
//       await api.post('/clientes', { nombre: 'Ana', ... });
import { supabase } from '../lib/supabase.js';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

async function peticion(metodo, ruta, cuerpo) {
  // Adjunta el token de la sesión para que el backend sepa quién eres.
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  const respuesta = await fetch(`${BASE_URL}${ruta}`, {
    method: metodo,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });

  const json = await respuesta.json().catch(() => ({}));

  // HU-44 CA3: token vencido o inválido → se cierra la sesión local y el panel vuelve al login.
  if (respuesta.status === 401) {
    try {
      sessionStorage.setItem('zaru:sesion-vencida', '1');
    } catch {
      // sessionStorage puede no estar disponible (modo privado); el login se muestra igual.
    }
    await supabase.auth.signOut({ scope: 'local' });
  }

  if (!respuesta.ok) {
    const error = new Error(json.error || 'Error en la petición');
    error.status = respuesta.status;
    error.codigo = json.codigo;
    throw error;
  }
  return json;
}

export const api = {
  get: (ruta) => peticion('GET', ruta),
  post: (ruta, cuerpo) => peticion('POST', ruta, cuerpo),
  put: (ruta, cuerpo) => peticion('PUT', ruta, cuerpo),
  patch: (ruta, cuerpo) => peticion('PATCH', ruta, cuerpo),
};
