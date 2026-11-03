// HU-07 — Esquemas de validación del catálogo de servicios.
import { z } from 'zod';

const nombre = z
  .string({ required_error: 'El nombre es obligatorio', invalid_type_error: 'El nombre debe ser texto' })
  .trim()
  .min(1, 'El nombre es obligatorio')
  .max(80, 'El nombre admite máximo 80 caracteres');

const precio = z
  .number({ required_error: 'El precio es obligatorio', invalid_type_error: 'El precio debe ser un número' })
  .finite('El precio debe ser un número válido')
  .min(0, 'El precio no puede ser negativo')
  .max(9999999999.99, 'El precio es demasiado alto')
  .refine((valor) => Math.abs(valor * 100 - Math.round(valor * 100)) < 1e-8, 'El precio admite máximo dos decimales');

const duracionMin = z
  .number({ required_error: 'La duración es obligatoria', invalid_type_error: 'La duración debe ser un número' })
  .int('La duración debe ser un número entero de minutos')
  .positive('La duración debe ser mayor que cero')
  .max(2147483647, 'La duración es demasiado alta');

export const servicioNuevo = z.object({ nombre, precio, duracionMin });

// PATCH parcial: editar cualquier campo o solo activar/desactivar.
export const servicioCambios = z
  .object({
    nombre: nombre.optional(),
    precio: precio.optional(),
    duracionMin: duracionMin.optional(),
    activo: z.boolean({ invalid_type_error: 'Activo debe ser verdadero o falso' }).optional(),
  })
  .refine((cambios) => Object.values(cambios).some((valor) => valor !== undefined), 'No hay datos para actualizar');

// ESC-F2-09: la orden nueva pide solo los servicios activos con ?activo=true.
export const filtroServicios = z.object({
  activo: z
    .enum(['true', 'false'], { errorMap: () => ({ message: 'El filtro activo debe ser true o false' }) })
    .transform((valor) => valor === 'true')
    .optional(),
});
