// HU-14: política de contraseña del panel.
// El proyecto no tenía una regla propia, así que se define una segura y se comunica en la pantalla.
export const LARGO_MINIMO = 8;
export const REGLAS_CONTRASENA =
  'Mínimo 8 caracteres, con al menos una letra y un número.';

/** Devuelve el mensaje de error o '' si la contraseña cumple la política. */
export function validarContrasena(valor) {
  if (!valor) return 'Ingresa una contraseña';
  if (valor.length < LARGO_MINIMO) {
    return `La contraseña debe tener al menos ${LARGO_MINIMO} caracteres`;
  }
  if (!/\p{L}/u.test(valor) || !/\d/.test(valor)) {
    return 'La contraseña debe incluir al menos una letra y un número';
  }
  return '';
}
