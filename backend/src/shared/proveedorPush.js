// HU-33 / HU-40 · Canal push con la misma interfaz que el correo y el SMS:
//   enviar({ para, asunto, texto, url, referencia }) → { idProveedor }
//
// HU-40 lo conecta con Web Push (estándar de los navegadores, sin servicios de pago): el backend firma
// cada envío con sus llaves VAPID y el servicio de push del navegador (Google, Mozilla, Apple) lo entrega
// al dispositivo. `para` es la suscripción del dispositivo en JSON ({ endpoint, keys: { p256dh, auth } }).
//
// Ambiente:
//   PUSH_PROVEEDOR=webpush + VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (https://… o mailto:…).
//   Sin ellas el canal queda "no configurado": falla sin reintentos y el aviso pasa al canal alterno
//   (HU-33 CA2), y la app no le ofrece push al cliente.
import webpush from 'web-push';
import { conTiempoMaximo } from './correo.js';

const TIEMPO_MAXIMO_MS = 10_000;
/** Si el dispositivo está apagado, el servicio de push guarda el aviso hasta 1 hora. */
const VIGENCIA_SEGUNDOS = 60 * 60;

/** ¿El ambiente tiene Web Push configurado? */
export function pushConfigurado(env = process.env) {
  return String(env.PUSH_PROVEEDOR ?? '').toLowerCase() === 'webpush'
    && Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT);
}

/** Llave pública VAPID: la usa el navegador para suscribirse. No es secreta. */
export function clavePublicaPush(env = process.env) {
  return pushConfigurado(env) ? env.VAPID_PUBLIC_KEY : null;
}

/** Suscripción guardada (JSON) → objeto que espera web-push. Lanza si no es válida. */
function leerSuscripcion(para) {
  const suscripcion = typeof para === 'string' ? JSON.parse(para) : para;
  if (!suscripcion?.endpoint || !suscripcion?.keys?.p256dh || !suscripcion?.keys?.auth) {
    const error = new Error('La notificación no tiene un dispositivo registrado válido');
    error.recuperable = false;
    throw error;
  }
  return suscripcion;
}

/** Errores del servicio de push: 404/410 = el dispositivo ya no existe; 429 y 5xx se reintentan. */
function errorDePush(err) {
  const status = err?.statusCode;
  const error = new Error(
    status === 404 || status === 410
      ? 'El dispositivo ya no está suscrito a las notificaciones'
      : `El servicio de push respondió ${status ?? 'sin estado'}${err?.body ? `: ${String(err.body).slice(0, 200)}` : ''}`,
  );
  error.status = status;
  error.recuperable = !status || status === 429 || status >= 500;
  error.suscripcionVencida = status === 404 || status === 410;
  return error;
}

export function proveedorPush(env = process.env, { lib = webpush } = {}) {
  if (!pushConfigurado(env)) {
    return {
      nombre: String(env.PUSH_PROVEEDOR ?? 'no_configurado').toLowerCase(),
      configurado: false,
      async enviar() {
        const error = new Error('El canal push no está configurado en este ambiente (HU-40)');
        error.recuperable = false;
        throw error;
      },
    };
  }

  const vapidDetails = { subject: env.VAPID_SUBJECT, publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY };
  return {
    nombre: 'webpush',
    configurado: true,
    async enviar({ para, asunto, texto, url, referencia }) {
      const suscripcion = leerSuscripcion(para);
      // Lo que recibe el service worker (frontend/public/sw-zaru.js) para mostrar la notificación.
      const carga = JSON.stringify({ titulo: asunto ?? 'Zaru', cuerpo: texto ?? '', url: url ?? null, etiqueta: referencia ?? null });
      try {
        const respuesta = await conTiempoMaximo(
          lib.sendNotification(suscripcion, carga, { vapidDetails, TTL: VIGENCIA_SEGUNDOS, urgency: 'high' }),
          TIEMPO_MAXIMO_MS,
        );
        return { idProveedor: respuesta?.headers?.location ?? null };
      } catch (err) {
        if (err?.statusCode === undefined && err?.recuperable !== undefined) throw err;
        throw errorDePush(err);
      }
    },
  };
}
