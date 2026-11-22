// HU-39/HU-40 — Igual que el registro push del cliente, pero con la sesión del panel: sirve para
// que la prueba real de envío pueda verificar el canal push del administrador.
import { RUTA_SERVICE_WORKER, claveABytes, mensajeSinSoporte, soportePush } from './push.js';
import { obtenerClavePush, quitarPushAdmin, registrarPushAdmin } from '../services/pushAdmin.js';

/**
 * Debe llamarse desde un clic: Safari solo muestra el permiso ante un gesto del usuario.
 * @returns {Promise<{ resultado: 'activado', dispositivo?: string } | { resultado: 'rechazado'|'sin-soporte', mensaje: string }>}
 */
export async function activarPushAdministrador({ nav = globalThis.navigator, win = globalThis.window } = {}) {
  const soporte = soportePush(nav, win);
  if (!soporte.soportado) {
    return { resultado: 'sin-soporte', mensaje: mensajeSinSoporte(soporte.motivo) };
  }
  const permiso = await win.Notification.requestPermission();
  if (permiso !== 'granted') {
    return { resultado: 'rechazado', mensaje: 'No activaste las notificaciones. La prueba seguirá por SMS o correo.' };
  }

  const [{ clavePublica }, registro] = await Promise.all([
    obtenerClavePush(),
    nav.serviceWorker.register(RUTA_SERVICE_WORKER).then(() => nav.serviceWorker.ready),
  ]);
  let suscripcion = await registro.pushManager.getSubscription();
  if (!suscripcion) {
    suscripcion = await registro.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: claveABytes(clavePublica),
    });
  }
  const datos = await registrarPushAdmin(suscripcion.toJSON());
  return { resultado: 'activado', dispositivo: datos.dispositivo };
}

/** El administrador deja de recibir la prueba por push en este navegador. */
export async function desactivarPushAdministrador({ nav = globalThis.navigator } = {}) {
  if (!nav?.serviceWorker) return { resultado: 'sin-soporte', mensaje: 'Este navegador no permite notificaciones push.' };
  const registro = await nav.serviceWorker.getRegistration(RUTA_SERVICE_WORKER);
  const suscripcion = registro ? await registro.pushManager.getSubscription() : null;
  if (suscripcion) {
    await quitarPushAdmin(suscripcion.endpoint);
    await suscripcion.unsubscribe();
  }
  return { resultado: 'desactivado', mensaje: 'Este dispositivo ya no recibirá la prueba por push.' };
}
