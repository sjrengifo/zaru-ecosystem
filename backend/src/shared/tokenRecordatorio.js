// HU-36 CA3 — Enlace firmado para dejar de recibir recordatorios de un vehículo.
//
// Es independiente del enlace de baja de autorizaciones (HU-30): este token solo identifica un
// vehículo de un establecimiento y solo puede desactivar sus recordatorios. Nunca autoriza a cambiar
// los avisos del servicio ni las promociones.
import { createHmac, hkdfSync, timingSafeEqual } from 'node:crypto';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const b64 = (buffer) => Buffer.from(buffer).toString('base64url');

function claveFirma() {
  const valor = process.env.ZARU_CLAVE_CIFRADO;
  const base = valor ? Buffer.from(valor, 'base64') : null;
  if (!base || base.length !== 32) throw new Error('ZARU_CLAVE_CIFRADO no está configurada o no es una clave de 32 bytes en base64');
  return Buffer.from(hkdfSync('sha256', base, Buffer.from('zaru'), Buffer.from('hu36-enlace-recordatorio-v1'), 32));
}

const firmar = (carga) => b64(createHmac('sha256', claveFirma()).update(carga).digest()).slice(0, 32);

export function crearTokenRecordatorio({ establecimientoId, clienteId, vehiculoId }) {
  if (!UUID.test(establecimientoId ?? '') || !UUID.test(clienteId ?? '') || !UUID.test(vehiculoId ?? '')) {
    throw new Error('Datos inválidos para el enlace de recordatorios');
  }
  const carga = b64(JSON.stringify({ v: 1, e: establecimientoId, c: clienteId, ve: vehiculoId }));
  return `${carga}.${firmar(carga)}`;
}

export function leerTokenRecordatorio(token) {
  const [carga, firma, sobrante] = String(token ?? '').split('.');
  if (!carga || !firma || sobrante !== undefined || carga.length > 400) return null;
  const esperada = Buffer.from(firmar(carga));
  const recibida = Buffer.from(firma);
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) return null;
  try {
    const { v, e, c, ve } = JSON.parse(Buffer.from(carga, 'base64url').toString('utf8'));
    if (v !== 1 || !UUID.test(e) || !UUID.test(c) || !UUID.test(ve)) return null;
    return { establecimientoId: e, clienteId: c, vehiculoId: ve };
  } catch {
    return null;
  }
}

export function enlaceRecordatorio(datos, base = process.env.FRONTEND_URL || 'http://localhost:5173') {
  return `${String(base).replace(/\/+$/, '')}/recordatorios/${crearTokenRecordatorio(datos)}/desactivar`;
}
