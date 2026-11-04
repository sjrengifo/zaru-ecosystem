// HU-02 — Validación de los datos de un operario.
// Deliberadamente no existen campos para `rol`, `establecimiento_id`, contraseña ni correo en la
// edición: zod descarta lo desconocido y el backend fija esos valores.
import { z } from 'zod';

const nombre = z
  .string({ required_error: 'El nombre es obligatorio', invalid_type_error: 'El nombre debe ser texto' })
  .trim()
  .min(2, 'El nombre debe tener al menos 2 caracteres')
  .max(120, 'El nombre admite máximo 120 caracteres');

const correo = z
  .string({ required_error: 'El correo es obligatorio', invalid_type_error: 'El correo debe ser texto' })
  .trim()
  .min(1, 'El correo es obligatorio')
  .pipe(z.string().email('El correo no tiene un formato válido').max(254, 'El correo admite máximo 254 caracteres'))
  .transform((valor) => valor.toLowerCase());

export const usuarioNuevo = z.object({ nombre, correo });

export const usuarioCambios = z
  .object({
    nombre: nombre.optional(),
    activo: z.boolean({ invalid_type_error: 'El estado debe ser verdadero o falso' }).optional(),
  })
  .refine((datos) => datos.nombre !== undefined || datos.activo !== undefined, {
    message: 'No hay datos para actualizar',
    path: [],
  });

export const idUsuario = z.object({
  id: z.string().uuid('El identificador del usuario no es válido'),
});
