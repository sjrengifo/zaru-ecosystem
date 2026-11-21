// HU-23 / HU-24 / RF-F5-12 — Sesión del cliente final (historial, notificaciones, preferencias).
//
// El cliente entra con un código de un solo uso que le llega por SMS a su celular registrado
// (shared/otpCliente.js). Al validarlo, el backend emite un "pase": un token firmado (HMAC) que viaja
// en la cabecera Authorization y solo da acceso a los datos de ese cliente en esa sede.
//
// - La firma usa ZARU_CLAVE_PASE o, si no existe, ZARU_CLAVE_CIFRADO. Nunca llega al frontend.
// - El pase dura 30 días (RF-F5-12) y no se puede alterar: cualquier cambio invalida la firma.
// - El establecimiento y el cliente salen del pase firmado, jamás de un id enviado por el usuario.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { supabase } from '../config/supabase.js';
import { crearAccesoTenant } from './tenant.js';
import { AppError, noEncontrado } from './errores.js';

export const DURACION_PASE_MS = 30 * 24 * 60 * 60 * 1000;

const paseInvalido = () =>
  new AppError('NO_AUTENTICADO', 'Tu sesión venció. Entra de nuevo con el código que te enviamos por SMS');

/** Clave del servidor para firmar pases; otpCliente deriva de ella la del hash de los códigos. */
export function clavePase() {
  const valor = process.env.ZARU_CLAVE_PASE || process.env.ZARU_CLAVE_CIFRADO;
  const bytes = valor ? Buffer.from(valor, 'base64') : null;
  if (!bytes || bytes.length < 32) {
    throw new Error('Falta ZARU_CLAVE_PASE o ZARU_CLAVE_CIFRADO para firmar el acceso del cliente');
  }
  return bytes;
}

/** Firma un pase con el establecimiento y el cliente verificados. */
export function firmarPase({ establecimientoId, clienteId, ahora = Date.now(), duracionMs = DURACION_PASE_MS }) {
  const exp = Math.floor((ahora + duracionMs) / 1000);
  const cuerpo = Buffer.from(JSON.stringify({ e: establecimientoId, c: clienteId, exp })).toString('base64url');
  const firma = createHmac('sha256', clavePase()).update(cuerpo).digest('base64url');
  return { pase: `${cuerpo}.${firma}`, expiraEn: new Date(exp * 1000).toISOString() };
}

/** Verifica firma y vigencia. Devuelve { establecimientoId, clienteId, expiraEn }. */
export function verificarPase(pase, { ahora = Date.now() } = {}) {
  const [cuerpo, firma] = String(pase ?? '').split('.');
  if (!cuerpo || !firma) throw paseInvalido();

  const esperada = createHmac('sha256', clavePase()).update(cuerpo).digest('base64url');
  const recibida = Buffer.from(firma);
  const calculada = Buffer.from(esperada);
  if (recibida.length !== calculada.length || !timingSafeEqual(recibida, calculada)) throw paseInvalido();

  let datos;
  try {
    datos = JSON.parse(Buffer.from(cuerpo, 'base64url').toString('utf8'));
  } catch {
    throw paseInvalido();
  }

  const expiraEn = Number(datos?.exp) * 1000;
  if (!datos?.e || !datos?.c || !Number.isFinite(expiraEn) || expiraEn <= ahora) throw paseInvalido();

  return { establecimientoId: datos.e, clienteId: datos.c, expiraEn: new Date(expiraEn).toISOString() };
}

/** Lee el pase de la cabecera Authorization: Bearer <pase> o X-Pase. */
export function paseDeLaPeticion(req) {
  const encabezado = req.get?.('authorization') ?? '';
  const [esquema, valor] = encabezado.split(' ');
  if (esquema === 'Bearer' && valor) return valor;
  return req.get?.('x-pase') ?? null;
}

/**
 * Middleware de las rutas del historial. Deja `req.cliente = { tenant, clienteId, establecimientoId }`.
 * Revalida en la base que la sede y el cliente sigan existiendo (un pase no sirve para siempre).
 */
export async function requierePase(req, res, next) {
  try {
    const { establecimientoId, clienteId, expiraEn } = verificarPase(paseDeLaPeticion(req));
    const tenant = crearAccesoTenant(supabase, { establecimientoId });

    const { data: sede, error } = await tenant
      .listar('establecimientos', 'id, nombre, slug, estado')
      .maybeSingle();
    if (error) throw error;
    if (!sede || sede.estado === 'suspendido') throw noEncontrado('Historial');

    const { data: cliente, error: errorCliente } = await tenant
      .listar('clientes', 'id, nombre')
      .eq('id', clienteId)
      .maybeSingle();
    if (errorCliente) throw errorCliente;
    if (!cliente) throw paseInvalido();

    req.cliente = { tenant, clienteId, establecimientoId, expiraEn, sede, nombre: cliente.nombre };
    next();
  } catch (err) {
    next(err);
  }
}
