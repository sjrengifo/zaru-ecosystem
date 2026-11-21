// HU-34 (RF-F6-17) — Canal alterno por SMS cuando el correo agota sus reintentos.
//
// Igual que el correo, el proveedor se elige por ambiente y la clave nunca sale del backend:
// - consola (por defecto): escribe el mensaje en el log. Sirve para desarrollo y pruebas.
// - twilio: API HTTP de Twilio con Basic Auth.
//
// `enviar` recibe el celular en texto plano (solo dentro del proceso) y devuelve el id del
// proveedor. Nunca se escribe el celular completo en los logs.
import { conTiempoMaximo } from './correo.js';
import { enmascararCelular } from './mascaras.js';

const TIEMPO_MAXIMO_MS = 10_000;

/** Proveedor de SMS según SMS_PROVEEDOR. Nunca lanza al construirse. */
export function proveedorSms(env = process.env) {
  const tipo = String(env.SMS_PROVEEDOR ?? 'consola').toLowerCase();

  if (tipo === 'twilio') {
    const sid = env.TWILIO_ACCOUNT_SID;
    const token = env.TWILIO_AUTH_TOKEN;
    const desde = env.TWILIO_FROM;

    return {
      nombre: 'twilio',
      configurado: Boolean(sid && token && desde),
      async enviar({ para, texto, referencia }) {
        if (!sid || !token || !desde) {
          const error = new Error('Twilio no está configurado (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM)');
          error.recuperable = false;
          throw error;
        }
        const cuerpo = new URLSearchParams({ To: `+57${para}`, From: desde, Body: texto });
        // HU-33 CA4: Twilio avisa al webhook cuando el SMS se entrega (y así no se duplica el aviso).
        const callback = urlConfirmacionTwilio(env, referencia);
        if (callback) cuerpo.set('StatusCallback', callback);
        const respuesta = await conTiempoMaximo(
          fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
            method: 'POST',
            headers: {
              Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: cuerpo,
          }),
          TIEMPO_MAXIMO_MS,
        );
        const json = await respuesta.json().catch(() => ({}));
        if (!respuesta.ok) {
          const error = new Error(json.message || `Twilio respondió ${respuesta.status}`);
          error.status = respuesta.status;
          // 4xx de Twilio suele ser número inválido o credenciales: no se reintenta.
          error.recuperable = respuesta.status >= 500 || respuesta.status === 429;
          throw error;
        }
        return { idProveedor: json.sid ?? null };
      },
    };
  }

  return {
    nombre: 'consola',
    configurado: true,
    async enviar({ para, texto }) {
      console.log(`[SMS consola] ${enmascararCelular(para)}: ${texto}`);
      return { idProveedor: `consola-${Date.now()}` };
    },
  };
}

/**
 * HU-33 CA4: dirección pública del webhook de Twilio para una notificación. Sin API_URL_PUBLICA
 * (desarrollo) no se pide confirmación de entrega.
 */
export function urlConfirmacionTwilio(env, referencia) {
  const base = String(env.API_URL_PUBLICA ?? '').replace(/\/+$/, '');
  if (!base || !referencia) return null;
  return `${base}/api/v1/webhooks/twilio?n=${encodeURIComponent(referencia)}`;
}

/** HU-29: ¿el ambiente puede enviar SMS? Con SMS_PROVEEDOR=deshabilitado el canal no se ofrece. */
export function smsDisponible(env = process.env) {
  return String(env.SMS_PROVEEDOR ?? 'consola').toLowerCase() !== 'deshabilitado';
}

/** Texto corto para el aviso alterno de "listo". */
export function textoAvisoListo({ establecimiento, placa, total }) {
  const sede = establecimiento?.nombre ? ` en ${establecimiento.nombre}` : '';
  const valor = Number.isFinite(Number(total))
    ? ` Valor a pagar: $${Number(total).toLocaleString('es-CO')}.`
    : '';
  return `Zaru: tu vehículo ${placa ?? ''} está listo${sede}.${valor} El pago se realiza en el establecimiento.`;
}

/** HU-29: texto corto del aviso de ingreso cuando el cliente eligió SMS. */
export function textoAvisoRecibido({ establecimiento, placa }) {
  const sede = establecimiento?.nombre ? ` en ${establecimiento.nombre}` : '';
  return `Zaru: recibimos tu vehículo ${placa ?? ''}${sede}. Te avisaremos cuando esté listo.`;
}

/** HU-29: texto del SMS de un evento de la orden (`orden.recibida` u `orden.lista`). */
export function textoAvisoSms(evento, datos) {
  return evento === 'orden.recibida' ? textoAvisoRecibido(datos) : textoAvisoListo(datos);
}

/** HU-29 CA2: SMS con el código de 6 dígitos para validar el celular. */
export function textoCodigoVerificacion(codigo, minutosVigencia) {
  return `Zaru: tu código de verificación es ${codigo}. Vence en ${minutosVigencia} minutos. No lo compartas con nadie.`;
}
