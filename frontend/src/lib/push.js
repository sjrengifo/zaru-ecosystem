// HU-40 (ZARU-70) — Reglas del permiso y la suscripción push en el navegador del cliente.
//
// CA1: al aceptar el permiso, el navegador se suscribe y el dispositivo queda registrado.
// CA2: si el cliente rechaza (o dice "Ahora no"), no se le vuelve a preguntar en la misma sesión;
//      SMS y correo siguen activos.
// CA3: si el navegador no soporta push, se le dice y se le sugiere SMS o correo. En iPhone el push web
//      solo funciona con la web instalada en la pantalla de inicio: ese caso se explica aparte.
import { eliminarPush, obtenerClavePush, registrarPush } from '../services/pushCliente.js';

export const RUTA_SERVICE_WORKER = '/sw-zaru.js';
const CLAVE_NO_INSISTIR = 'zaru:push:no-insistir';

/**
 * ¿Este navegador puede recibir push?
 * @returns {{ soportado: boolean, motivo: null | 'navegador' | 'ios-sin-instalar' }}
 */
export function soportePush(nav = globalThis.navigator, win = globalThis.window) {
  const esIOS = /iPhone|iPad|iPod/.test(nav?.userAgent ?? '');
  const instalada = Boolean(win?.matchMedia?.('(display-mode: standalone)')?.matches || nav?.standalone === true);
  const tieneApis = Boolean(nav && 'serviceWorker' in nav && win && 'PushManager' in win && 'Notification' in win);
  if (esIOS && !instalada) return { soportado: false, motivo: 'ios-sin-instalar' };
  if (!tieneApis) return { soportado: false, motivo: 'navegador' };
  return { soportado: true, motivo: null };
}

/** Permiso actual: 'default' (sin preguntar), 'granted', 'denied' o 'unsupported'. */
export function permisoPush(win = globalThis.window) {
  return win && 'Notification' in win ? win.Notification.permission : 'unsupported';
}

/** CA3: qué decirle al cliente cuando no puede activar push. */
export function mensajeSinSoporte(motivo) {
  if (motivo === 'ios-sin-instalar') {
    return 'En iPhone, agrega esta página a tu pantalla de inicio (Compartir → Agregar a inicio) para recibir notificaciones. Mientras, te avisamos por SMS o correo.';
  }
  return 'Tu navegador no permite notificaciones push. Elige recibir tus avisos por SMS o correo.';
}

/** CA2: después de un rechazo o de "Ahora no", no se insiste en esta sesión. */
export function noInsistir() {
  try {
    return sessionStorage.getItem(CLAVE_NO_INSISTIR) === '1';
  } catch {
    return false;
  }
}
export function marcarNoInsistir() {
  try {
    sessionStorage.setItem(CLAVE_NO_INSISTIR, '1');
  } catch {
    // Sin sessionStorage (modo privado estricto) simplemente se vuelve a ofrecer en la próxima visita.
  }
}

/** Llave VAPID (base64url) → bytes, como la pide pushManager.subscribe. */
export function claveABytes(base64url) {
  const relleno = '='.repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + relleno).replace(/-/g, '+').replace(/_/g, '/');
  const binario = atob(base64);
  return Uint8Array.from(binario, (c) => c.charCodeAt(0));
}

/** ¿Este navegador ya tiene una suscripción activa? */
export async function suscripcionActual(nav = globalThis.navigator) {
  if (!nav?.serviceWorker) return null;
  const registro = await nav.serviceWorker.getRegistration(RUTA_SERVICE_WORKER);
  return registro ? registro.pushManager.getSubscription() : null;
}

/**
 * CA1: pide el permiso, suscribe el navegador y registra el dispositivo del cliente.
 * Debe llamarse directamente desde un clic: Safari solo muestra el permiso ante un gesto del usuario.
 * @returns {Promise<{ resultado: 'activado', dispositivo?: string } | { resultado: 'rechazado' } | { resultado: 'sin-soporte', motivo: string }>}
 */
export async function activarPush(pase, { nav = globalThis.navigator, win = globalThis.window } = {}) {
  const soporte = soportePush(nav, win);
  if (!soporte.soportado) return { resultado: 'sin-soporte', motivo: soporte.motivo };

  // Primero el permiso, antes de cualquier otra espera, para no perder el gesto del usuario.
  const permiso = await win.Notification.requestPermission();
  if (permiso !== 'granted') {
    marcarNoInsistir();
    return { resultado: 'rechazado' };
  }

  const [{ clavePublica }, registro] = await Promise.all([
    obtenerClavePush(),
    nav.serviceWorker.register(RUTA_SERVICE_WORKER).then(() => nav.serviceWorker.ready),
  ]);
  let suscripcion = await registro.pushManager.getSubscription();
  if (!suscripcion) {
    suscripcion = await registro.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: claveABytes(clavePublica) });
  }
  const datos = await registrarPush(pase, suscripcion.toJSON());
  return { resultado: 'activado', dispositivo: datos.dispositivo };
}

/** El cliente deja de recibir push en este navegador. */
export async function desactivarPush(pase, { nav = globalThis.navigator } = {}) {
  const suscripcion = await suscripcionActual(nav);
  if (!suscripcion) return;
  await eliminarPush(pase, suscripcion.endpoint);
  await suscripcion.unsubscribe();
}
