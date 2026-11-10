// HU-30 — Autorización y revocación del tratamiento de datos para notificaciones (Ley 1581 de 2012).
//
// Hay dos autorizaciones independientes, además del tratamiento de datos de HU-51:
//   - notificaciones_servicio: avisos del estado del vehículo (HU-46, HU-28).
//   - comerciales: promociones y campañas del establecimiento (HU-35).
// Cada cambio es una fila nueva en `consentimientos` (solo inserción), con fecha, hora, canal y versión de
// la política (CA4). La autorización vigente es la fila más reciente de cada tipo (vista
// autorizaciones_vigentes). Este módulo es el único lugar que decide si un cliente puede recibir un
// mensaje: el envío de avisos (HU-46) y las campañas (HU-35) deben consultarlo.
//
// CA3: los correos llevan un enlace "dejar de recibir" firmado. Abrirlo no requiere sesión; el token solo
// sirve para revocar esa autorización de ese cliente y no se puede falsificar sin la clave del servidor.
import { createHmac, hkdfSync, timingSafeEqual } from 'node:crypto';
import { AppError } from './errores.js';
import { obtenerPoliticaVigente } from './politicas.js';

export const TIPOS = {
  servicio: 'notificaciones_servicio',
  comerciales: 'comerciales',
};
const TIPOS_VALIDOS = new Set(Object.values(TIPOS));

/** Cómo llamamos a cada autorización frente al cliente y en el panel. */
export const NOMBRE_TIPO = {
  tratamiento_datos: 'Tratamiento de datos',
  notificaciones_servicio: 'Avisos del estado del vehículo',
  comerciales: 'Promociones y ofertas',
};

/**
 * Valor cuando no hay ninguna fila de ese tipo (no debería ocurrir tras la migración de HU-30):
 * los avisos del servicio son una finalidad de la política que el titular aceptó; las promociones
 * exigen autorización expresa y por separado, así que nunca se suponen.
 */
const POR_DEFECTO = { notificaciones_servicio: true, comerciales: false };

const vistaDe = (fila, tipo) =>
  fila
    ? { otorgado: fila.otorgado, fecha: fila.created_at, canal: fila.canal, politicaVersion: fila.politica_version }
    : { otorgado: POR_DEFECTO[tipo] ?? false, fecha: null, canal: null, politicaVersion: null };

/**
 * Autorizaciones vigentes de un cliente.
 * @returns {Promise<{ tratamientoDatos: object, notificacionesServicio: object, comerciales: object }>}
 */
export async function autorizacionesDe(tenant, clienteId) {
  const { data, error } = await tenant
    .listar('autorizaciones_vigentes', 'tipo, otorgado, canal, politica_version, created_at')
    .eq('cliente_id', clienteId);
  if (error) throw error;
  const porTipo = new Map((data ?? []).map((f) => [f.tipo, f]));
  return {
    tratamientoDatos: vistaDe(porTipo.get('tratamiento_datos'), 'tratamiento_datos'),
    notificacionesServicio: vistaDe(porTipo.get(TIPOS.servicio), TIPOS.servicio),
    comerciales: vistaDe(porTipo.get(TIPOS.comerciales), TIPOS.comerciales),
  };
}

/** ¿El cliente puede recibir avisos del servicio? (HU-46: se consulta antes de cada correo). */
export async function puedeRecibir(tenant, clienteId, tipo) {
  const actual = await autorizacionesDe(tenant, clienteId);
  return tipo === TIPOS.comerciales ? actual.comerciales.otorgado : actual.notificacionesServicio.otorgado;
}

/**
 * CA2: de una lista de clientes, solo los que autorizaron comunicaciones comerciales.
 * Las campañas de promociones (HU-35) deben pasar SIEMPRE por aquí antes de enviar.
 * @param {string[]} clienteIds
 * @returns {Promise<string[]>} ids autorizados, en el mismo orden recibido
 */
export async function destinatariosComerciales(tenant, clienteIds) {
  const ids = [...new Set(clienteIds ?? [])];
  if (!ids.length) return [];
  const { data, error } = await tenant
    .listar('autorizaciones_vigentes', 'cliente_id, otorgado')
    .eq('tipo', TIPOS.comerciales)
    .in('cliente_id', ids);
  if (error) throw error;
  const autorizados = new Set((data ?? []).filter((f) => f.otorgado === true).map((f) => f.cliente_id));
  return ids.filter((id) => autorizados.has(id));
}

/**
 * Registra un otorgamiento o una revocación (CA3, CA4). Si la autorización ya está así, no agrega
 * una fila: la evidencia solo guarda cambios reales.
 * @returns {Promise<{ cambio: boolean, autorizaciones: object }>}
 */
export async function registrarAutorizacion(tenant, { clienteId, tipo, otorgado, canal, ip = null, usuarioId = null }) {
  if (!TIPOS_VALIDOS.has(tipo)) throw new AppError('VALIDACION', 'Tipo de autorización desconocido', [{ campo: 'tipo', mensaje: 'Debe ser notificaciones_servicio o comerciales' }]);
  const antes = await autorizacionesDe(tenant, clienteId);
  const actual = tipo === TIPOS.comerciales ? antes.comerciales : antes.notificacionesServicio;
  if (actual.otorgado === otorgado && actual.fecha) return { cambio: false, autorizaciones: antes };

  const { version } = await obtenerPoliticaVigente();
  await tenant.crear('consentimientos', {
    cliente_id: clienteId,
    tipo,
    otorgado,
    canal,
    politica_version: version,
    ip,
    registrado_por: usuarioId,
  }, 'id');
  return { cambio: true, autorizaciones: await autorizacionesDe(tenant, clienteId) };
}

// ---------------------------------------------------------------------------
// Enlace "dejar de recibir" (CA3)
// ---------------------------------------------------------------------------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const b64 = (buffer) => Buffer.from(buffer).toString('base64url');

/** Clave del HMAC derivada de la clave del servidor (no se reutiliza la de cifrado directamente). */
function claveFirma() {
  const valor = process.env.ZARU_CLAVE_CIFRADO;
  const base = valor ? Buffer.from(valor, 'base64') : null;
  if (!base || base.length !== 32) throw new Error('ZARU_CLAVE_CIFRADO no está configurada o no es una clave de 32 bytes en base64');
  return Buffer.from(hkdfSync('sha256', base, Buffer.from('zaru'), Buffer.from('hu30-enlace-baja-v1'), 32));
}

const firmar = (carga) => b64(createHmac('sha256', claveFirma()).update(carga).digest()).slice(0, 32);

/** Token para revocar una autorización de un cliente sin iniciar sesión. */
export function crearTokenBaja({ establecimientoId, clienteId, tipo }) {
  if (!UUID.test(establecimientoId ?? '') || !UUID.test(clienteId ?? '') || !TIPOS_VALIDOS.has(tipo)) {
    throw new Error('Datos inválidos para el enlace de baja');
  }
  const carga = b64(JSON.stringify({ v: 1, e: establecimientoId, c: clienteId, t: tipo }));
  return `${carga}.${firmar(carga)}`;
}

/** Valida el token. Devuelve null si fue alterado o no tiene el formato esperado. */
export function leerTokenBaja(token) {
  const [carga, firma, sobrante] = String(token ?? '').split('.');
  if (!carga || !firma || sobrante !== undefined || carga.length > 400) return null;
  const esperada = Buffer.from(firmar(carga));
  const recibida = Buffer.from(firma);
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) return null;
  try {
    const { v, e, c, t } = JSON.parse(Buffer.from(carga, 'base64url').toString('utf8'));
    if (v !== 1 || !UUID.test(e) || !UUID.test(c) || !TIPOS_VALIDOS.has(t)) return null;
    return { establecimientoId: e, clienteId: c, tipo: t };
  } catch {
    return null;
  }
}

/** Enlace público de la página "dejar de recibir" (la sirve el panel, como el seguimiento). */
export function enlaceBaja(datos, base = process.env.FRONTEND_URL || 'http://localhost:5173') {
  return `${String(base).replace(/\/+$/, '')}/baja/${crearTokenBaja(datos)}`;
}
