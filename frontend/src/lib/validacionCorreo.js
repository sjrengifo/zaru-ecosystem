// HU-14: validación del correo compartida por el login y la recuperación.
export const CORREO_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const normalizarCorreo = (correo) => correo.trim().toLowerCase();

/** Devuelve el mensaje de error o '' si el correo es válido. */
export function validarCorreo(correo) {
  const normalizado = normalizarCorreo(correo);
  if (!normalizado) return 'El correo es obligatorio';
  if (!CORREO_VALIDO.test(normalizado)) return 'El correo no tiene un formato válido';
  return '';
}
