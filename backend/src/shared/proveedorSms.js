// HU-34 (RF-F6-17) — Canal alterno por SMS cuando el correo agota sus reintentos.
//
// Igual que el correo, el proveedor se elige por ambiente y la clave nunca sale del backend:
// - consola (por defecto): escribe el mensaje en el log. Sirve para desarrollo y pruebas.
// - twilio: API HTTP de Twilio con Basic Auth.
// - mixto (desarrollo y demos): todo se escribe en el log como en consola y, además, sale por Twilio
//   solo a los celulares de SMS_NUMEROS_REALES. Así se prueba el SMS real en el teléfono propio sin
//   gastar saldo ni escribirle a clientes de prueba.
//
// `enviar` recibe el celular en texto plano (solo dentro del proceso) y devuelve el id del
// proveedor. Nunca se escribe el celular completo en los logs.
import { conTiempoMaximo } from './correo.js';
import { enmascararCelular } from './mascaras.js';

const TIEMPO_MAXIMO_MS = 10_000;

/** SMS_NUMEROS_REALES: celulares separados por coma; se aceptan +57, espacios y guiones. */
export function numerosReales(env = process.env) {
  return new Set(
    String(env.SMS_NUMEROS_REALES ?? '')
      .split(',')
      .map((n) => n.replace(/\D/g, '').replace(/^57(?=3\d{9}$)/, ''))
      .filter((n) => /^3\d{9}$/.test(n)),
  );
}

/** Proveedor de SMS según SMS_PROVEEDOR. Nunca lanza al construirse. */
export function proveedorSms(env = process.env) {
  const tipo = String(env.SMS_PROVEEDOR ?? 'consola').toLowerCase();

  if (tipo === 'mixto') {
    const consola = proveedorSms({ ...env, SMS_PROVEEDOR: 'consola' });
    const twilio = proveedorSms({ ...env, SMS_PROVEEDOR: 'twilio' });
    const reales = numerosReales(env);
    return {
      nombre: 'mixto',
      configurado: true,
      async enviar(mensaje) {
        const enConsola = await consola.enviar(mensaje);
        if (!reales.has(String(mensaje.para))) return enConsola;
        // Un fallo de Twilio se propaga para que el worker reintente igual que en modo twilio.
        return twilio.enviar(mensaje);
      },
    };
  }

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

// ---------------------------------------------------------------------------
// HU-28 (ZARU-17): textos cortos de cada cambio de estado (SMS y push). Llevan la placa, el estado y
// la hora del cambio (CA1); el de "listo" agrega la sede, su dirección y el valor a pagar (CA2).
// ---------------------------------------------------------------------------

/** Hora en Colombia, p. ej. "4:26 p. m.". Sin hora válida devuelve ''. */
export function horaCorta(valor) {
  const fecha = new Date(valor ?? NaN);
  if (Number.isNaN(fecha.getTime())) return '';
  return new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', hour: 'numeric', minute: '2-digit' }).format(fecha);
}

const enSede = (establecimiento) => (establecimiento?.nombre ? ` en ${establecimiento.nombre}` : '');
const aLas = (hora) => (horaCorta(hora) ? ` a las ${horaCorta(hora)}` : '');
/** Cierra la frase con punto sin duplicarlo (la hora ya termina en "p. m."). */
const conPunto = (frase) => (frase.endsWith('.') ? frase : `${frase}.`);

/** Texto del aviso de "listo" (también el alterno de HU-34). */
export function textoAvisoListo({ establecimiento, placa, total, hora }) {
  const direccion = establecimiento?.direccion ? ` (${establecimiento.direccion})` : '';
  const valor = Number.isFinite(Number(total))
    ? ` Valor a pagar: $${Number(total).toLocaleString('es-CO')}.`
    : '';
  return `${conPunto(`Zaru: tu vehículo ${placa ?? ''} está listo para recoger${enSede(establecimiento)}${direccion}${aLas(hora)}`)}${valor} El pago se realiza en el establecimiento.`;
}

/** Texto del aviso de ingreso. */
export function textoAvisoRecibido({ establecimiento, placa, hora }) {
  return `${conPunto(`Zaru: recibimos tu vehículo ${placa ?? ''}${enSede(establecimiento)}${aLas(hora)}`)} Te avisaremos cada vez que cambie de estado.`;
}

/** Estados intermedios y la entrega: qué pasó y, si aplica, un cierre. */
const FRASE_ESTADO = {
  'orden.en_lavado': { accion: 'inició el lavado', cierre: '' },
  'orden.secado': { accion: 'pasó a secado', cierre: '' },
  'orden.entregada': { accion: 'fue entregado', cierre: ' ¡Gracias por tu visita!' },
};

/** Texto corto del aviso de un evento de la orden, para SMS y push. */
export function textoAvisoSms(evento, datos) {
  if (evento === 'orden.recibida') return textoAvisoRecibido(datos);
  const frase = FRASE_ESTADO[evento];
  if (!frase) return textoAvisoListo(datos);
  return `${conPunto(`Zaru: tu vehículo ${datos.placa ?? ''} ${frase.accion}${enSede(datos.establecimiento)}${aLas(datos.hora)}`)}${frase.cierre}`;
}

/** HU-28 CA3: corrección cuando se avisó un estado que el operario revirtió. */
export function textoCorreccion({ establecimiento, placa, estadoActual }) {
  return `Zaru: corrección sobre tu vehículo ${placa ?? ''}${enSede(establecimiento)}: el aviso anterior fue un error. Tu vehículo sigue en estado "${estadoActual}".`;
}

/** HU-29 CA2: SMS con el código de 6 dígitos para validar el celular. */
export function textoCodigoVerificacion(codigo, minutosVigencia) {
  return `Zaru: tu código de verificación es ${codigo}. Vence en ${minutosVigencia} minutos. No lo compartas con nadie.`;
}
