// HU-23 / HU-24 — Llamadas públicas del historial del cliente final. No usan la sesión del panel.
//
// El acceso se obtiene verificando placa + celular y devuelve un pase firmado de vida corta. El pase
// se guarda en sessionStorage (se borra al cerrar la pestaña) y viaja en Authorization: Bearer.
const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api/v1';

const clavePase = (slug) => `zaru:historial:${slug}`;

export function leerPase(slug) {
  try {
    return sessionStorage.getItem(clavePase(slug));
  } catch {
    return null;
  }
}

export function guardarPase(slug, pase) {
  try {
    if (pase) sessionStorage.setItem(clavePase(slug), pase);
    else sessionStorage.removeItem(clavePase(slug));
  } catch {
    // sessionStorage puede no estar disponible (modo privado); la consulta se hace igual en memoria.
  }
}

async function leer(respuesta, mensajePorDefecto) {
  const json = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) {
    const error = new Error(json.error?.mensaje || mensajePorDefecto);
    error.status = respuesta.status;
    error.codigo = json.error?.codigo;
    error.detalles = json.error?.detalles;
    throw error;
  }
  return json;
}

function conPase(pase, opciones = {}) {
  return { ...opciones, headers: { ...(opciones.headers ?? {}), Authorization: `Bearer ${pase}` }, cache: 'no-store' };
}

/** POST /publico/sedes/{slug}/historial/acceso — { placa, celular } → { pase, expiraEn, sede, cliente }. */
export async function accederHistorial(slug, { placa, celular }) {
  const respuesta = await fetch(`${BASE_URL}/publico/sedes/${encodeURIComponent(slug)}/historial/acceso`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ placa, celular }),
    cache: 'no-store',
  });
  return leer(respuesta, 'No pudimos verificar tu acceso');
}

/** Vehículos del cliente autenticado (para el filtro por placa). */
export async function listarVehiculosCliente(pase) {
  const respuesta = await fetch(`${BASE_URL}/publico/cliente/vehiculos`, conPase(pase));
  return leer(respuesta, 'No pudimos cargar tus vehículos');
}

/** Historial de servicios entregados, del más reciente al más antiguo. */
export async function listarHistorialCliente(pase, { placa } = {}) {
  const params = new URLSearchParams();
  if (placa) params.set('placa', placa);
  const consulta = params.toString();
  const respuesta = await fetch(
    `${BASE_URL}/publico/cliente/historial${consulta ? `?${consulta}` : ''}`,
    conPase(pase),
  );
  return leer(respuesta, 'No pudimos cargar tu historial');
}

/** Detalle de un único servicio entregado. */
export async function obtenerDetalleHistorialCliente(pase, ordenId) {
  const respuesta = await fetch(
    `${BASE_URL}/publico/cliente/historial/${encodeURIComponent(ordenId)}`,
    conPase(pase),
  );
  return leer(respuesta, 'No pudimos cargar el detalle del servicio');
}
