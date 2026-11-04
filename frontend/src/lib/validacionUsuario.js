// HU-02 — Validación del formulario de operarios. El backend repite estas reglas.
import { normalizarCorreo, validarCorreo } from './validacionCorreo.js';

export const NOMBRE_MAXIMO = 120;

const texto = (valor) => String(valor ?? '').trim();

/**
 * @param {{ nombre: string, correo: string }} datos
 * @param {{ conCorreo?: boolean }} opciones el correo solo se valida al crear; después es de solo lectura.
 */
export function validarUsuario({ nombre, correo }, { conCorreo = true } = {}) {
  const errores = {};
  const nombreLimpio = texto(nombre);

  if (!nombreLimpio) errores.nombre = 'El nombre es obligatorio';
  else if (nombreLimpio.length < 2) errores.nombre = 'El nombre debe tener al menos 2 caracteres';
  else if (nombreLimpio.length > NOMBRE_MAXIMO) errores.nombre = `El nombre admite máximo ${NOMBRE_MAXIMO} caracteres`;

  if (conCorreo) {
    const errorCorreo = validarCorreo(correo);
    if (errorCorreo) errores.correo = errorCorreo;
  }

  return errores;
}

export function usuarioAFormulario(usuario) {
  return {
    nombre: texto(usuario?.nombre),
    correo: normalizarCorreo(usuario?.correo ?? ''),
  };
}
