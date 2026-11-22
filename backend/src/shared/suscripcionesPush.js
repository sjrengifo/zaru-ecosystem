// HU-40 (ZARU-70) — Dispositivos del cliente final registrados para recibir avisos push.
//
// CA1: al aceptar el permiso, la web móvil envía la suscripción Web Push del navegador y queda asociada
//      al cliente del pase (nunca a un id enviado por el usuario).
// Un mismo navegador (endpoint) pertenece a un solo cliente: si otro se registra desde ahí, la
// suscripción pasa a ese cliente. Cuando el servicio de push dice que ya no existe, se borra.
import { AppError } from './errores.js';
import { pushConfigurado } from './proveedorPush.js';

const COLUMNAS = 'id, cliente_id, endpoint, p256dh, auth, dispositivo, actualizada_at';

/** User-Agent recortado a algo legible: "Chrome en Android", "Safari en iPhone"… */
export function nombreDispositivo(userAgent = '') {
  const ua = String(userAgent);
  const navegador = /Edg\//.test(ua) ? 'Edge'
    : /OPR\//.test(ua) ? 'Opera'
      : /Firefox\//.test(ua) ? 'Firefox'
        : /Chrome\//.test(ua) ? 'Chrome'
          : /Safari\//.test(ua) ? 'Safari'
            : 'Navegador';
  const sistema = /iPhone|iPad/.test(ua) ? 'iPhone'
    : /Android/.test(ua) ? 'Android'
      : /Windows/.test(ua) ? 'Windows'
        : /Mac OS X/.test(ua) ? 'Mac'
          : /Linux/.test(ua) ? 'Linux'
            : null;
  return sistema ? `${navegador} en ${sistema}` : navegador;
}

/** Suscripción más reciente del cliente (o null). Es a la que se envía el aviso push. */
export async function suscripcionVigente(tenant, clienteId) {
  const { data, error } = await tenant
    .listar('suscripciones_push', COLUMNAS)
    .eq('cliente_id', clienteId)
    .order('actualizada_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  return data?.[0] ?? null;
}

/** ¿El cliente puede recibir push? Ambiente configurado y al menos un dispositivo registrado. */
export async function tienePush(tenant, clienteId) {
  if (!pushConfigurado()) return false;
  try {
    return Boolean(await suscripcionVigente(tenant, clienteId));
  } catch (err) {
    // Sin la tabla (migración pendiente) o sin base: push no se ofrece y los demás canales siguen igual.
    console.warn('[HU-40] No se pudieron leer las suscripciones push:', err?.message ?? err);
    return false;
  }
}

/** La suscripción como la necesita el proveedor (JSON con endpoint y llaves). */
export const suscripcionComoDestino = (fila) =>
  JSON.stringify({ endpoint: fila.endpoint, keys: { p256dh: fila.p256dh, auth: fila.auth } });

/**
 * CA1: guarda (o actualiza) el dispositivo del cliente.
 * @param {{ endpoint: string, keys: { p256dh: string, auth: string } }} entrada ya validada
 */
export async function registrarDispositivo(tenant, clienteId, { endpoint, keys }, { userAgent, ahora = new Date() } = {}) {
  if (!pushConfigurado()) {
    throw new AppError('SERVICIO_NO_DISPONIBLE', 'Las notificaciones push no están disponibles en este momento');
  }
  const valores = {
    cliente_id: clienteId,
    endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
    dispositivo: nombreDispositivo(userAgent).slice(0, 200),
    actualizada_at: ahora.toISOString(),
  };

  const { data: existente, error } = await tenant
    .listar('suscripciones_push', 'id')
    .eq('endpoint', endpoint)
    .maybeSingle();
  if (error) throw error;

  let fila;
  try {
    fila = existente
      ? await tenant.actualizar('suscripciones_push', existente.id, valores, COLUMNAS, 'Suscripción')
      : await tenant.crear('suscripciones_push', valores, COLUMNAS);
  } catch (err) {
    // El endpoint es único en toda la plataforma: este navegador ya recibe avisos de otra sede.
    if (err?.codigo === 'CONFLICTO') {
      throw new AppError('CONFLICTO', 'Este navegador ya recibe avisos de otro car wash. Desactívalos allá para usarlo aquí');
    }
    throw err;
  }
  return { registrado: true, dispositivo: fila.dispositivo };
}

/** El cliente desactiva push en este dispositivo. Borrar algo que no existe no es un error. */
export async function eliminarDispositivo(tenant, clienteId, endpoint) {
  const { data, error } = await tenant
    .listar('suscripciones_push', 'id')
    .eq('cliente_id', clienteId)
    .eq('endpoint', endpoint)
    .maybeSingle();
  if (error) throw error;
  if (data) await tenant.eliminar('suscripciones_push', data.id, 'Suscripción');
  return { registrado: false };
}

/** El servicio de push respondió 404/410: el dispositivo ya no existe y se borra su suscripción. */
export async function olvidarSuscripcionVencida(tenant, destino) {
  try {
    const { endpoint } = JSON.parse(destino);
    if (!endpoint) return;
    const { data } = await tenant.listar('suscripciones_push', 'id').eq('endpoint', endpoint).maybeSingle();
    if (data) await tenant.eliminar('suscripciones_push', data.id, 'Suscripción');
  } catch (err) {
    console.warn('[HU-40] No se pudo borrar la suscripción vencida:', err?.message ?? err);
  }
}
