// HU-23 / HU-24 — Llamadas públicas del historial del cliente final. No usan la sesión del panel.
//
// RF-F5-11/12: el cliente entra con su celular y el código de 6 dígitos que le llega por SMS, y recibe
// un pase firmado de 30 días. El pase se guarda en localStorage (sigue dentro al volver a abrir la app
// en ese celular hasta que cierre sesión) y viaja en Authorization: Bearer.
export const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api/v1';

const clavePase = (slug) => `zaru:historial:${slug}`;

export function leerPase(slug) {
  try {
    return localStorage.getItem(clavePase(slug));
  } catch {
    return null;
  }
}

export function guardarPase(slug, pase) {
  try {
    if (pase) localStorage.setItem(clavePase(slug), pase);
    else localStorage.removeItem(clavePase(slug));
  } catch {
    // localStorage puede no estar disponible (modo privado); la consulta se hace igual en memoria.
  }
}

export async function leer(respuesta, mensajePorDefecto) {
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

export function conPase(pase, opciones = {}) {
  return { ...opciones, headers: { ...(opciones.headers ?? {}), Authorization: `Bearer ${pase}` }, cache: 'no-store' };
}

const enviarAcceso = (slug, ruta, cuerpo) =>
  fetch(`${BASE_URL}/publico/sedes/${encodeURIComponent(slug)}/${ruta}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
    cache: 'no-store',
  });

/** POST /publico/sedes/{slug}/otp — { celular, canal: 'sms'|'correo' } → 202 { enviado, canal, celular, expiraEn }. */
export async function solicitarCodigoAcceso(slug, { celular, canal = 'sms' }) {
  return leer(await enviarAcceso(slug, 'otp', { celular, canal }), 'No pudimos enviarte el código');
}

/** POST /publico/sedes/{slug}/otp/verificar — { celular, codigo } → { pase, expiraEn, sede, cliente }. */
export async function verificarCodigoAcceso(slug, { celular, codigo }) {
  return leer(await enviarAcceso(slug, 'otp/verificar', { celular, codigo }), 'No pudimos verificar el código');
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
