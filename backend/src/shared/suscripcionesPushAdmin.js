// HU-39/HU-40 — Dispositivo push del administrador de la sede.
//
// La prueba de envío (POST /notificaciones/prueba) toma el correo y el celular de Supabase Auth.
// Push necesita además una suscripción Web Push: HU-40 la registra para clientes finales con pase,
// y este módulo hace lo mismo para el administrador autenticado, sin recibir ids del frontend.
// El usuario sale de req.ctx y la sede de req.tenant (HU-41).
import { AppError } from './errores.js';
import { pushConfigurado } from './proveedorPush.js';
import { nombreDispositivo, suscripcionComoDestino } from './suscripcionesPush.js';

const COLUMNAS = 'id, establecimiento_id, usuario_id, endpoint, p256dh, auth, dispositivo, actualizada_at';

/** Suscripción vigente del administrador (o null). Solo se lee con el acceso del tenant. */
export async function suscripcionAdminVigente(tenant, usuarioId) {
  if (!tenant || !usuarioId) return null;
  try {
    const { data, error } = await tenant
      .listar('notificaciones_push_admin', COLUMNAS)
      .eq('usuario_id', usuarioId)
      .order('actualizada_at', { ascending: false })
      .limit(1);
    if (error) throw error;
    return data?.[0] ?? null;
  } catch (err) {
    // Migración aún no aplicada: push se reporta sin destino y SMS/correo siguen funcionando.
    if (['42P01', 'PGRST205'].includes(err?.code)) {
      console.warn('[HU-39] Falta la tabla notificaciones_push_admin (migración 20261122130000).');
      return null;
    }
    throw err;
  }
}

/** La suscripción en el formato que espera el proveedor, y un nombre seguro para mostrar. */
export function destinoAdminPush(fila) {
  if (!fila) return { valor: null, visible: null };
  return { valor: suscripcionComoDestino(fila), visible: fila.dispositivo ?? null };
}

/**
 * Guarda (o actualiza) el dispositivo del administrador. Un solo dispositivo por usuario en la sede:
 * activar push en otro navegador reemplaza al anterior, igual que el cliente final.
 */
export async function registrarDispositivoAdmin(
  tenant,
  usuarioId,
  { endpoint, keys },
  { userAgent, ahora = new Date() } = {},
) {
  if (!pushConfigurado()) {
    throw new AppError('SERVICIO_NO_DISPONIBLE', 'Las notificaciones push no están disponibles en este momento');
  }
  const valores = {
    establecimiento_id: tenant.establecimientoId,
    usuario_id: usuarioId,
    endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
    dispositivo: nombreDispositivo(userAgent).slice(0, 200),
    actualizada_at: ahora.toISOString(),
  };

  const { data: existente, error } = await tenant
    .listar('notificaciones_push_admin', 'id')
    .eq('usuario_id', usuarioId)
    .maybeSingle();
  if (error) throw error;

  const fila = existente
    ? await tenant.actualizar('notificaciones_push_admin', existente.id, valores, COLUMNAS, 'Dispositivo push')
    : await tenant.crear('notificaciones_push_admin', valores, COLUMNAS);
  return { registrado: true, dispositivo: fila.dispositivo ?? valores.dispositivo };
}

/** El administrador deja de recibir push en la prueba de esta sede. */
export async function eliminarDispositivoAdmin(tenant, usuarioId, endpoint) {
  if (!tenant || !usuarioId) return { registrado: false };
  const consulta = tenant
    .listar('notificaciones_push_admin', 'id')
    .eq('usuario_id', usuarioId);
  if (endpoint) consulta.eq('endpoint', endpoint);
  const { data, error } = await consulta.maybeSingle();
  if (error) throw error;
  if (data) await tenant.eliminar('notificaciones_push_admin', data.id, 'Dispositivo push');
  return { registrado: false };
}
