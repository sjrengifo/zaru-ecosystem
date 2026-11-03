// HU-07 — Validación del formulario de servicios. El backend repite estas reglas.
export const PRECIO_MAXIMO = 9999999999.99;
export const NOMBRE_MAXIMO = 80;

const texto = (valor) => String(valor ?? '').trim();

export function validarServicio({ nombre, precio, duracionMin }) {
  const errores = {};
  const nombreLimpio = texto(nombre);

  if (!nombreLimpio) errores.nombre = 'El nombre es obligatorio';
  else if (nombreLimpio.length > NOMBRE_MAXIMO) errores.nombre = `El nombre admite máximo ${NOMBRE_MAXIMO} caracteres`;

  const precioNumero = Number(precio);
  if (texto(precio) === '') errores.precio = 'El precio es obligatorio';
  else if (!Number.isFinite(precioNumero)) errores.precio = 'El precio debe ser un número';
  else if (precioNumero < 0) errores.precio = 'El precio no puede ser negativo';
  else if (precioNumero > PRECIO_MAXIMO) errores.precio = 'El precio es demasiado alto';
  else if (Math.abs(precioNumero * 100 - Math.round(precioNumero * 100)) >= 1e-8) {
    errores.precio = 'El precio admite máximo dos decimales';
  }

  const duracion = Number(duracionMin);
  if (texto(duracionMin) === '') errores.duracionMin = 'La duración es obligatoria';
  else if (!Number.isInteger(duracion)) errores.duracionMin = 'La duración debe ser un número entero de minutos';
  else if (duracion <= 0) errores.duracionMin = 'La duración debe ser mayor que cero';

  return errores;
}

export const servicioAFormulario = (servicio) => ({
  nombre: servicio?.nombre ?? '',
  precio: servicio ? String(Number(servicio.precio)) : '',
  duracionMin: servicio ? String(servicio.duracion_min) : '',
});
