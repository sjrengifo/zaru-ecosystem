// HU-46 — Envío de correos por SMTP.
//
// Sirve con cualquier proveedor SMTP (Gmail con contraseña de aplicación, Brevo, Resend, etc.).
// Se configura con variables de entorno; si faltan, no se envía nada y se informa el motivo.
// Esta función nunca lanza: devuelve { enviado, motivo } para que quien la llama decida qué registrar.
import nodemailer from 'nodemailer';

const TIEMPO_MAXIMO_MS = 10_000;

let transporteCache = null;
let claveCache = null;

/** Configuración SMTP leída del entorno, o null si está incompleta. */
export function configuracionCorreo(variables = process.env) {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, CORREO_REMITENTE } = variables;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !CORREO_REMITENTE) return null;
  const puerto = Number(SMTP_PORT || 587);
  return {
    host: SMTP_HOST,
    port: puerto,
    secure: puerto === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    remitente: CORREO_REMITENTE,
  };
}

function transporte(config) {
  const clave = `${config.host}:${config.port}:${config.auth.user}`;
  if (!transporteCache || claveCache !== clave) {
    const { remitente, ...opciones } = config;
    transporteCache = nodemailer.createTransport({
      ...opciones,
      connectionTimeout: TIEMPO_MAXIMO_MS,
      greetingTimeout: TIEMPO_MAXIMO_MS,
      socketTimeout: TIEMPO_MAXIMO_MS,
    });
    claveCache = clave;
  }
  return transporteCache;
}

/**
 * Envía un correo. `crearTransporte` existe para las pruebas.
 * @returns {Promise<{ enviado: boolean, id?: string, motivo?: string }>}
 */
export async function enviarCorreo({ para, asunto, texto, html }, { variables = process.env, crearTransporte = transporte } = {}) {
  const config = configuracionCorreo(variables);
  if (!config) return { enviado: false, motivo: 'El envío de correos no está configurado (SMTP)' };
  if (!para) return { enviado: false, motivo: 'El destinatario no tiene correo' };

  try {
    const info = await crearTransporte(config).sendMail({
      from: config.remitente,
      to: para,
      subject: asunto,
      text: texto,
      html,
    });
    return { enviado: true, id: info?.messageId };
  } catch (err) {
    return { enviado: false, motivo: `El proveedor rechazó el envío: ${err?.message ?? 'error desconocido'}` };
  }
}
