// HU-46 — Proveedores de correo con una interfaz común:  enviar({ para, asunto, html, texto }) → { idProveedor }
//
// Se elige con CORREO_PROVEEDOR (DA-09):
// - consola (por defecto): no envía nada, escribe el mensaje en el log. Para desarrollo y pruebas.
// - smtp:   cualquier servidor SMTP (Gmail con contraseña de aplicación, Mailtrap, Brevo…) con nodemailer.
// - resend: API HTTP de Resend (plan gratuito), sin dependencias adicionales.
//
// Ningún proveedor debe tardar indefinidamente: cada envío tiene un tiempo máximo (CA3).

const TIEMPO_MAXIMO_MS = 10_000;

/** Rechaza la promesa si tarda más de `ms`. */
export function conTiempoMaximo(promesa, ms = TIEMPO_MAXIMO_MS) {
  let espera;
  const limite = new Promise((_, rechazar) => {
    espera = setTimeout(() => rechazar(new Error(`El proveedor de correo no respondió en ${ms / 1000} s`)), ms);
  });
  return Promise.race([promesa, limite]).finally(() => clearTimeout(espera));
}

/** Oculta parte del correo para los logs: juan.perez@correo.com → j***@correo.com */
export function enmascararCorreo(correo) {
  if (typeof correo !== 'string' || !correo.includes('@')) return '***';
  const [usuario, dominio] = correo.split('@');
  return `${usuario.slice(0, 1)}***@${dominio}`;
}

function proveedorConsola() {
  return {
    nombre: 'consola',
    async enviar({ para, asunto }) {
      console.info(`[correo:consola] Para ${enmascararCorreo(para)} · ${asunto}`);
      return { idProveedor: `consola-${Date.now()}` };
    },
  };
}

function proveedorResend(env, fetchImpl = globalThis.fetch) {
  return {
    nombre: 'resend',
    async enviar({ para, asunto, html, texto, referencia }) {
      const headers = { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' };
      // HU-33 CA4: con la misma clave, Resend no envía dos veces el mismo correo (24 h) aunque un
      // reintento salga porque la respuesta anterior se perdió. La etiqueta permite reconocer la
      // notificación cuando el webhook confirme la entrega.
      if (referencia) headers['Idempotency-Key'] = `zaru-${referencia}`;
      const correo = { from: env.CORREO_REMITENTE, to: [para], subject: asunto, html, text: texto };
      if (referencia) correo.tags = [{ name: 'notificacion', value: String(referencia) }];
      const respuesta = await fetchImpl('https://api.resend.com/emails', {
        method: 'POST',
        headers,
        body: JSON.stringify(correo),
      });
      const cuerpo = await respuesta.json().catch(() => ({}));
      if (!respuesta.ok) throw new Error(`Resend respondió ${respuesta.status}: ${cuerpo.message ?? 'error desconocido'}`);
      return { idProveedor: cuerpo.id ?? null };
    },
  };
}

function proveedorSmtp(env) {
  let transporte;
  return {
    nombre: 'smtp',
    async enviar({ para, asunto, html, texto, referencia }) {
      if (!transporte) {
        const { default: nodemailer } = await import('nodemailer');
        const puerto = Number(env.SMTP_PORT ?? 587);
        transporte = nodemailer.createTransport({
          host: env.SMTP_HOST,
          port: puerto,
          secure: puerto === 465,
          auth: env.SMTP_USUARIO ? { user: env.SMTP_USUARIO, pass: env.SMTP_CLAVE } : undefined,
        });
      }
      const headers = referencia ? { 'X-Zaru-Notificacion': String(referencia) } : undefined;
      const info = await transporte.sendMail({ from: env.CORREO_REMITENTE, to: para, subject: asunto, html, text: texto, headers });
      return { idProveedor: info.messageId ?? null };
    },
  };
}

/** Crea el proveedor configurado. Recibe las variables para poder probarlo sin tocar process.env. */
export function crearProveedorCorreo(env = process.env, dependencias = {}) {
  const nombre = env.CORREO_PROVEEDOR || 'consola';
  const remitente = env.CORREO_REMITENTE || 'Zaru <notificaciones@zaru.app>';
  const config = { ...env, CORREO_REMITENTE: remitente };
  if (nombre === 'resend') return proveedorResend(config, dependencias.fetch);
  if (nombre === 'smtp') return proveedorSmtp(config);
  return proveedorConsola();
}

let proveedorActual;

/** Proveedor de la aplicación (se crea una vez). Las pruebas pueden reemplazarlo con usarProveedorCorreo. */
export function proveedorCorreo() {
  proveedorActual ??= crearProveedorCorreo();
  return proveedorActual;
}

/** Reemplaza el proveedor (pruebas). Con null vuelve al configurado en el entorno. */
export function usarProveedorCorreo(proveedor) {
  proveedorActual = proveedor ?? undefined;
}
