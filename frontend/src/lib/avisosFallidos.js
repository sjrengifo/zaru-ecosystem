// HU-33 CA3 — Textos de las alertas de avisos que no llegaron por ningún canal.
import { formatoCelular } from './accesoCliente.js';

const NOMBRE_CANAL = { push: 'notificación push', sms: 'SMS', correo: 'correo' };

/** "correo y SMS", "push, SMS y correo". */
export function canalesIntentados(canales = []) {
  const nombres = canales.map((c) => NOMBRE_CANAL[c] ?? c);
  if (nombres.length <= 1) return nombres.join('');
  return `${nombres.slice(0, -1).join(', ')} y ${nombres.at(-1)}`;
}

/** Hace cuánto falló, en palabras cortas. */
export function haceCuanto(fecha, ahora = Date.now()) {
  const minutos = Math.max(0, Math.floor((ahora - new Date(fecha).getTime()) / 60_000));
  if (minutos < 1) return 'hace un momento';
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  return horas < 24 ? `hace ${horas} h` : `hace ${Math.floor(horas / 24)} d`;
}

/** Enlace para llamar desde el celular del administrador. */
export const enlaceLlamada = (celular) => `tel:+57${String(celular ?? '').replace(/\D/g, '')}`;

export const celularLegible = (celular) => formatoCelular(celular ?? '');
