// Validación de los datos de contacto de un cliente, para mostrar todos los errores de una vez.
// Usa los mismos mensajes de la API, que sigue siendo quien decide.

export const limpiarTelefono = (telefono) => telefono.replace(/[\s-]/g, '');

export function validarContacto({ nombre, telefono, correo }, { correoObligatorio = true } = {}) {
  const errores = {};
  if (!nombre.trim()) errores.nombre = 'El nombre es obligatorio';
  if (!telefono.trim()) errores.telefono = 'El teléfono es obligatorio';
  else if (!/^3\d{9}$/.test(limpiarTelefono(telefono))) errores.telefono = 'El teléfono debe ser un celular colombiano de 10 dígitos que empiece por 3';
  if (!correo.trim()) {
    if (correoObligatorio) errores.correo = 'El correo es obligatorio';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo.trim())) {
    errores.correo = 'El correo no tiene un formato válido';
  }
  return errores;
}
