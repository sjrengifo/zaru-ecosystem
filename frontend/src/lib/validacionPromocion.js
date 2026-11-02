// HU-12 · Validación de una promoción en el navegador, para mostrar todos los errores de una vez.
// Usa los mismos mensajes de la API, que sigue siendo quien decide.

export const ESTADOS_PROMOCION = {
  vigente: 'Vigente',
  programada: 'Programada',
  vencida: 'Vencida',
  desactivada: 'Desactivada',
};

/** Hoy en Bogotá (AAAA-MM-DD): la vigencia se calcula con esta fecha, no con la del computador. */
export const hoyBogota = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());

export function validarPromocion({ nombre, descuentoPct, fechaInicio, fechaFin, servicioIds }, { nueva }) {
  const errores = {};
  if (!nombre.trim()) errores.nombre = 'El nombre es obligatorio';
  const pct = Number(descuentoPct);
  if (descuentoPct === '') errores.descuentoPct = 'El descuento es obligatorio';
  else if (!Number.isInteger(pct) || pct < 1 || pct > 100) errores.descuentoPct = 'El descuento debe ser un número entero entre 1 y 100';
  if (!fechaInicio) errores.fechaInicio = 'La fecha de inicio es obligatoria';
  if (!fechaFin) errores.fechaFin = 'La fecha de fin es obligatoria';
  else if (fechaInicio && fechaFin < fechaInicio) errores.fechaFin = 'La fecha de fin no puede ser anterior a la de inicio';
  else if (nueva && fechaFin < hoyBogota()) errores.fechaFin = 'La fecha de fin no puede ser anterior a hoy';
  if (servicioIds.length === 0) errores.servicioIds = 'Elige al menos un servicio';
  return errores;
}
