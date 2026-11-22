// HU-33 CA4 — Webhooks de entrega de los proveedores (Resend para correo, Twilio para SMS).
//
// Son rutas públicas: la autenticidad la da la firma del proveedor, verificada con un secreto que
// solo conocen el proveedor y el backend. Sin el secreto configurado el webhook responde 503 y no
// cambia nada. Siempre se responde 200 a un evento válido que no corresponde a ninguna notificación,
// para que el proveedor no lo reintente sin fin.
import { supabase } from '../config/supabase.js';
import { AppError } from '../shared/errores.js';
import {
  confirmarEntrega,
  firmaResendValida,
  firmaTwilioValida,
  notificacionDeEventoResend,
} from '../shared/confirmacionEntrega.js';

const firmaInvalida = () => new AppError('NO_AUTENTICADO', 'Firma del proveedor inválida');
const noConfigurado = () => new AppError('SERVICIO_NO_DISPONIBLE', 'El webhook no está configurado en este ambiente');

/** POST /webhooks/resend — eventos email.delivered de Resend. */
export async function resend(req, res, next) {
  try {
    const secreto = process.env.RESEND_WEBHOOK_SECRET;
    if (!secreto) throw noConfigurado();
    const valida = firmaResendValida({
      secreto,
      id: req.get('svix-id'),
      timestamp: req.get('svix-timestamp'),
      firmas: req.get('svix-signature'),
      cuerpo: req.cuerpoCrudo?.toString('utf8'),
    });
    if (!valida) throw firmaInvalida();

    const evento = req.body ?? {};
    if (evento.type !== 'email.delivered') return res.json({ recibido: true, ignorado: evento.type ?? null });

    const resultado = await confirmarEntrega(supabase, {
      notificacionId: notificacionDeEventoResend(evento),
      idProveedor: evento.data?.email_id ?? null,
      proveedor: 'resend',
    });
    res.json({ recibido: true, ...resultado });
  } catch (err) {
    next(err);
  }
}

/** POST /webhooks/twilio?n={notificacion} — StatusCallback de Twilio (formulario). */
export async function twilio(req, res, next) {
  try {
    const token = process.env.TWILIO_AUTH_TOKEN;
    const base = String(process.env.API_URL_PUBLICA ?? '').replace(/\/+$/, '');
    if (!token || !base) throw noConfigurado();
    const valida = firmaTwilioValida({
      token,
      url: `${base}${req.originalUrl}`,
      parametros: req.body ?? {},
      firma: req.get('x-twilio-signature'),
    });
    if (!valida) throw firmaInvalida();

    const estado = String(req.body?.MessageStatus ?? '');
    if (estado !== 'delivered') return res.json({ recibido: true, ignorado: estado || null });

    const resultado = await confirmarEntrega(supabase, {
      notificacionId: /^[0-9a-f-]{36}$/i.test(String(req.query.n ?? '')) ? String(req.query.n) : null,
      idProveedor: req.body?.MessageSid ?? null,
      proveedor: 'twilio',
    });
    res.json({ recibido: true, ...resultado });
  } catch (err) {
    next(err);
  }
}
