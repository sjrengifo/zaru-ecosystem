// HU-34 CA3 — Enmascarado de datos personales en la bitácora.
//
// El destino de una notificación está cifrado (HU-50), así que el enmascarado se hace en el
// backend: el panel nunca recibe el celular ni el correo completos. Ejemplos:
//   3001234567      → 300****567
//   yeliani@gmail.com → yel****@gmail.com
import { descifrar } from './cifrado.js';

const soloDigitos = (valor) => String(valor ?? '').replace(/\D/g, '');

/** Celular: primeros 3 y últimos 3 dígitos. Para números cortos se oculta todo. */
export function enmascararCelular(valor) {
  let digitos = soloDigitos(valor);
  // Acepta el celular guardado con el indicativo de Colombia (+57 300…).
  if (digitos.length === 12 && digitos.startsWith('57')) digitos = digitos.slice(2);
  if (!digitos) return null;
  if (digitos.length <= 6) return '*'.repeat(digitos.length);
  return `${digitos.slice(0, 3)}****${digitos.slice(-3)}`;
}

/** Correo: primeros 3 caracteres de la parte local + dominio. */
export function enmascararCorreo(valor) {
  const correo = String(valor ?? '').trim();
  const arroba = correo.lastIndexOf('@');
  if (arroba <= 0 || arroba === correo.length - 1) return null;
  const local = correo.slice(0, arroba);
  const dominio = correo.slice(arroba + 1);
  const visibles = local.length >= 3 ? local.slice(0, 3) : local.slice(0, 1);
  return `${visibles}****@${dominio}`;
}

/** Texto libre que no es celular ni correo (p. ej. una suscripción push). */
function enmascararGenerico(valor) {
  const texto = String(valor ?? '');
  if (!texto) return null;
  return texto.length <= 4 ? '*'.repeat(texto.length) : `${texto.slice(0, 2)}****${texto.slice(-2)}`;
}

/** Descifra el destino si hace falta y lo enmascara según el canal. Nunca lanza. */
export function enmascararDestino(canal, destino) {
  let valor = destino;
  try {
    valor = descifrar(destino);
  } catch {
    // Destinos antiguos o de prueba pueden estar en texto plano; se enmascaran igual.
  }
  if (canal === 'correo') return enmascararCorreo(valor);
  if (canal === 'sms') return enmascararCelular(valor);
  return enmascararGenerico(valor);
}

/** Enmascara un celular que ya está en texto plano (p. ej. clientes.telefono en una alerta). */
export const celularEnmascarado = (valor) => enmascararCelular(valor) ?? '—';

export { soloDigitos };
