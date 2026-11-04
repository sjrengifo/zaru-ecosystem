// Funciones para hablar con el backend.
// Uso:  const clientes = await api.get('/clientes');
//       await api.post('/clientes', { nombre: 'Ana', ... });
import { supabase } from '../lib/supabase.js';
import { borrarBranding } from '../lib/brandingGuardado.js';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api/v1';

/** ¿La sesión actual sigue habilitada? Sin red no se puede confirmar y se conserva. */
async function sesionSigueVigente() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return false;
  try {
    const respuesta = await fetch(`${BASE_URL}/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return respuesta.ok;
  } catch {
    return true;
  }
}

async function cerrarSesionLocal(motivo) {
  try {
    sessionStorage.setItem(motivo, '1');
  } catch {
    // sessionStorage puede no estar disponible (modo privado); el login se muestra igual.
  }
  borrarBranding();
  await supabase.auth.signOut({ scope: 'local' });
}

async function peticion(metodo, ruta, cuerpo) {
  // Adjunta el token de la sesión para que el backend sepa quién eres.
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  // Un archivo (FormData) se envía tal cual: el navegador fija el Content-Type multipart con su separador.
  const esArchivo = cuerpo instanceof FormData;

  const respuesta = await fetch(`${BASE_URL}${ruta}`, {
    method: metodo,
    headers: {
      ...(!esArchivo && { 'Content-Type': 'application/json' }),
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: esArchivo ? cuerpo : cuerpo ? JSON.stringify(cuerpo) : undefined,
  });

  const json = await respuesta.json().catch(() => ({}));

  // HU-44 CA3: token vencido o inválido → se cierra la sesión local y el panel vuelve al login.
  if (respuesta.status === 401) {
    await cerrarSesionLocal('zaru:sesion-vencida');
  }

  // HU-02 CA3: una cuenta desactivada recibe 403 aunque su token siga vigente. Se revalida /me
  // para no cerrar la sesión de un operario que solo intentó una acción exclusiva del admin.
  if (respuesta.status === 403 && ruta !== '/me' && !(await sesionSigueVigente())) {
    await cerrarSesionLocal('zaru:sesion-revocada');
  }

  // HU-43: formato de error estándar { error: { codigo, mensaje, detalles?, requestId } }.
  if (!respuesta.ok) {
    const error = new Error(json.error?.mensaje || 'Error en la petición');
    error.status = respuesta.status;
    error.codigo = json.error?.codigo;
    error.detalles = json.error?.detalles ?? [];
    error.requestId = json.error?.requestId;
    throw error;
  }
  return json;
}

export const api = {
  get: (ruta) => peticion('GET', ruta),
  post: (ruta, cuerpo) => peticion('POST', ruta, cuerpo),
  put: (ruta, cuerpo) => peticion('PUT', ruta, cuerpo),
  patch: (ruta, cuerpo) => peticion('PATCH', ruta, cuerpo),
  delete: (ruta) => peticion('DELETE', ruta),
  /** Envía un formulario con archivos:  await api.subir('/establecimiento/logo', formData) */
  subir: (ruta, formData) => peticion('POST', ruta, formData),
};
