// HU-33 CA4 — Confirmación de entrega desde los proveedores (webhooks) y cero duplicados.
//
// Un proveedor puede entregar un mensaje después de que el sistema lo dio por fallido (por ejemplo,
// la respuesta se perdió por tiempo agotado). Cuando el proveedor avisa que sí lo entregó:
//   1. la notificación queda "entregada";
//   2. se cancelan los reintentos y los alternos pendientes de la misma cadena, para que el cliente
//      no reciba el mismo aviso dos veces;
//   3. si la cadena había quedado como alerta del dashboard (CA3), la alerta se cierra sola.
//
// Solo se acepta un aviso con la firma válida del proveedor:
//   - Resend firma con Svix: HMAC-SHA256 de `id.timestamp.cuerpo` con el secreto `whsec_…`.
//   - Twilio firma con HMAC-SHA1 de la URL más los parámetros ordenados, con el Auth Token.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { crearAccesoTenant } from './tenant.js';

const TOLERANCIA_SEGUNDOS = 5 * 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function iguales(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Firma de Resend (Svix). `firmas` es el encabezado svix-signature: "v1,<base64> v1,<base64>".
 * @returns {boolean}
 */
export function firmaResendValida({ secreto, id, timestamp, firmas, cuerpo, ahora = Date.now() }) {
  if (!secreto || !id || !timestamp || !firmas || cuerpo == null) return false;
  const segundos = Number(timestamp);
  if (!Number.isFinite(segundos) || Math.abs(ahora / 1000 - segundos) > TOLERANCIA_SEGUNDOS) return false;
  const clave = Buffer.from(String(secreto).replace(/^whsec_/, ''), 'base64');
  const esperada = createHmac('sha256', clave).update(`${id}.${timestamp}.${cuerpo}`).digest('base64');
  return String(firmas)
    .split(' ')
    .map((parte) => parte.split(',')[1])
    .some((firma) => firma && iguales(firma, esperada));
}

/**
 * Firma de Twilio (X-Twilio-Signature). `url` es la dirección pública completa que Twilio llamó.
 * @returns {boolean}
 */
export function firmaTwilioValida({ token, url, parametros = {}, firma }) {
  if (!token || !url || !firma) return false;
  const datos = Object.keys(parametros)
    .sort()
    .reduce((acumulado, clave) => acumulado + clave + parametros[clave], url);
  const esperada = createHmac('sha1', token).update(datos).digest('base64');
  return iguales(firma, esperada);
}

/** Id de la notificación en un evento de Resend: la etiqueta `notificacion` (lista u objeto). */
export function notificacionDeEventoResend(evento) {
  const tags = evento?.data?.tags;
  const valor = Array.isArray(tags)
    ? tags.find((t) => t?.name === 'notificacion')?.value
    : tags?.notificacion;
  return UUID.test(String(valor ?? '')) ? String(valor) : null;
}

/**
 * Marca la entrega y cancela lo pendiente de la misma cadena. `db` es el cliente con service_role:
 * el webhook no tiene sesión; el establecimiento se toma de la propia notificación (HU-41).
 * @returns {Promise<{ resultado: 'confirmada'|'ya_confirmada'|'desconocida', cancelados?: number }>}
 */
export async function confirmarEntrega(db, { notificacionId, idProveedor = null, proveedor = null, ahora = new Date() }) {
  let consulta = db.from('notificaciones').select('id, establecimiento_id, estado, contenido, notificacion_origen_id');
  consulta = notificacionId ? consulta.eq('id', notificacionId) : consulta.eq('contenido->>idProveedor', idProveedor);
  const { data: fila, error } = await consulta.maybeSingle();
  if (error) throw error;
  if (!fila) return { resultado: 'desconocida' };
  if (fila.estado === 'entregada') return { resultado: 'ya_confirmada' };

  const tenant = crearAccesoTenant(db, { establecimientoId: fila.establecimiento_id });
  const iso = ahora.toISOString();
  await tenant.actualizar('notificaciones', fila.id, {
    estado: 'entregada',
    error: null,
    proximo_intento_at: null,
    contenido: {
      ...(fila.contenido ?? {}),
      ...(proveedor ? { proveedor } : {}),
      ...(idProveedor ? { idProveedor } : {}),
      entregaConfirmada: true,
      entregadaAt: iso,
    },
  }, 'id', 'Notificación');

  // La cadena: el original y sus alternos.
  const origen = fila.notificacion_origen_id ?? fila.id;
  const { data: cadena, error: errorCadena } = await tenant
    .listar('notificaciones', 'id, estado, fallo_definitivo_at, alerta_atendida_at')
    .or(`id.eq.${origen},notificacion_origen_id.eq.${origen}`);
  if (errorCadena) throw errorCadena;

  let cancelados = 0;
  for (const otra of cadena ?? []) {
    if (otra.id === fila.id) continue;
    if (['pendiente', 'programada', 'enviando'].includes(otra.estado)) {
      // Solo cancela si sigue pendiente: si el worker ya la envió, no se pisa su estado.
      const { data: cancelada } = await db
        .from('notificaciones')
        .update({ estado: 'cancelada', error: 'El aviso original se entregó', proximo_intento_at: null })
        .eq('id', otra.id)
        .in('estado', ['pendiente', 'programada'])
        .select('id')
        .maybeSingle();
      if (cancelada) cancelados += 1;
    }
  }

  // CA3: la alerta del dashboard ya no hace falta.
  const alertas = (cadena ?? []).filter((f) => f.fallo_definitivo_at && !f.alerta_atendida_at).map((f) => f.id);
  if (alertas.length) {
    await db.from('notificaciones').update({ alerta_atendida_at: iso }).in('id', alertas);
  }

  // HU-34: la bitácora distingue aceptado de entregado.
  await db.from('notificacion_intentos').update({ entregado: true }).eq('notificacion_id', fila.id).eq('resultado', 'enviado');

  return { resultado: 'confirmada', cancelados };
}
