// HU-16 — Filtro de fechas de los reportes (HU-43 CA2).
// Las fechas llegan como AAAA-MM-DD, se validan como días reales y el rango
// incluye el día final completo en la zona horaria de Bogotá.
import { z } from 'zod';

const FORMATO_DIA = /^\d{4}-\d{2}-\d{2}$/;

function esDiaReal(texto) {
  const [anio, mes, dia] = texto.split('-').map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  return fecha.getUTCFullYear() === anio && fecha.getUTCMonth() === mes - 1 && fecha.getUTCDate() === dia;
}

const fecha = (nombre) =>
  z
    .string({
      required_error: `Indica la fecha de ${nombre}`,
      invalid_type_error: `La fecha de ${nombre} debe tener el formato AAAA-MM-DD`,
    })
    .trim()
    .regex(FORMATO_DIA, `La fecha de ${nombre} debe tener el formato AAAA-MM-DD`)
    .refine(esDiaReal, `La fecha de ${nombre} no es válida`);

export const rangoReporte = z
  .object({
    desde: fecha('inicio'),
    hasta: fecha('fin'),
  })
  .refine(({ desde, hasta }) => desde <= hasta, {
    path: ['desde'],
    message: 'La fecha de inicio no puede ser posterior a la fecha de fin',
  });
