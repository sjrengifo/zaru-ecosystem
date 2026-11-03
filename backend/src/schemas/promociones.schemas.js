// HU-12 — Esquemas de validación de promociones (HU-43 CA2).
import { z } from 'zod';

/** Fecha de hoy en Bogotá (AAAA-MM-DD), la misma que usa la base para calcular la vigencia. */
export const hoyBogota = (ahora = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).format(ahora);

const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2}$/;

// Si el formato ya está mal, ese es el único error que se muestra.
const esFechaReal = (valor) => {
  if (!FORMATO_FECHA.test(valor)) return true;
  const fecha = new Date(`${valor}T00:00:00Z`);
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === valor;
};

const fecha = (campo) =>
  z
    .string({ required_error: `${campo} es obligatoria`, invalid_type_error: `${campo} debe ser texto` })
    .regex(FORMATO_FECHA, `${campo} debe tener el formato AAAA-MM-DD`)
    .refine(esFechaReal, `${campo} no es una fecha válida`);

const opcional = (campo, max) =>
  z
    .string({ invalid_type_error: `${campo} debe ser texto` })
    .trim()
    .max(max, `${campo} admite máximo ${max} caracteres`)
    .transform((valor) => valor || null)
    .nullable()
    .optional();

const campos = {
  nombre: z
    .string({ required_error: 'El nombre es obligatorio', invalid_type_error: 'El nombre debe ser texto' })
    .trim()
    .min(1, 'El nombre es obligatorio')
    .max(80, 'El nombre admite máximo 80 caracteres'),
  descripcion: opcional('La descripción', 500),
  condiciones: opcional('Las condiciones', 500),
  // RF-F4-01: porcentaje entero de 1 a 100.
  descuentoPct: z
    .number({ required_error: 'El descuento es obligatorio', invalid_type_error: 'El descuento debe ser un número' })
    .int('El descuento debe ser un número entero')
    .min(1, 'El descuento debe estar entre 1 % y 100 %')
    .max(100, 'El descuento debe estar entre 1 % y 100 %'),
  fechaInicio: fecha('La fecha de inicio'),
  fechaFin: fecha('La fecha de fin'),
  // RF-F4-01: al menos un servicio; los repetidos se cuentan una vez.
  servicioIds: z
    .array(z.string().uuid('Un servicio elegido no es válido'), {
      required_error: 'Elige al menos un servicio',
      invalid_type_error: 'Los servicios deben ser una lista',
    })
    .min(1, 'Elige al menos un servicio')
    .transform((ids) => [...new Set(ids)]),
  activa: z.boolean({ invalid_type_error: 'Activa debe ser verdadero o falso' }),
};

const finNoAntesDelInicio = ({ fechaInicio, fechaFin }, ctx) => {
  if (fechaInicio && fechaFin && fechaFin < fechaInicio) {
    ctx.addIssue({ code: 'custom', path: ['fechaFin'], message: 'La fecha de fin no puede ser anterior a la de inicio' });
  }
};

/** Una promoción completa: la que se crea, o la que resulta de aplicar los cambios a la guardada. */
export const promocionCompleta = z.object({ ...campos, activa: campos.activa.optional() }).superRefine(finNoAntesDelInicio);

// Crear una promoción que ya terminó no tiene sentido: la fecha de fin debe ser hoy o posterior.
export const promocionNueva = promocionCompleta.superRefine(({ fechaFin }, ctx) => {
  if (fechaFin && fechaFin < hoyBogota()) {
    ctx.addIssue({ code: 'custom', path: ['fechaFin'], message: 'La fecha de fin no puede ser anterior a hoy' });
  }
});

// RF-F4-03: editar cualquier campo o solo activar/desactivar. La regla de fechas se valida después de
// combinar con la promoción guardada (ver el controlador).
export const promocionCambios = z
  .object(Object.fromEntries(Object.entries(campos).map(([campo, esquema]) => [campo, esquema.optional()])))
  .refine((cambios) => Object.values(cambios).some((valor) => valor !== undefined), 'No hay datos para actualizar');

// RF-F4-06
export const filtroPromociones = z.object({
  estado: z
    .enum(['vigentes', 'programadas', 'vencidas', 'todas'], {
      errorMap: () => ({ message: 'El estado debe ser vigentes, programadas, vencidas o todas' }),
    })
    .default('todas'),
});
