// HU-08: las órdenes exigen código de seguimiento. Las pruebas que insertan órdenes directamente
// (sin pasar por crear_orden) usan este código, con el mismo alfabeto que privado.nuevo_codigo_seguimiento().
import { randomInt } from 'node:crypto';

const ALFABETO = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

export function codigoSeguimiento() {
  return Array.from({ length: 10 }, () => ALFABETO[randomInt(ALFABETO.length)]).join('');
}
