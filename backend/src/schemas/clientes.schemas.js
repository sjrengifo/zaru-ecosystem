// HU-03, HU-04 — Esquemas de validación de clientes (HU-43 CA2).
import { z } from 'zod';

const texto = (campo, max) =>
  z
    .string({ required_error: `${campo} es obligatorio`, invalid_type_error: `${campo} debe ser texto` })
    .trim()
    .min(1, `${campo} es obligatorio`)
    .max(max, `${campo} admite máximo ${max} caracteres`);

const nombre = texto('El nombre', 120);
const telefono = z
  .string({ required_error: 'El teléfono es obligatorio', invalid_type_error: 'El teléfono debe ser texto' })
  .trim()
  .regex(/^3\d{9}$/, 'El teléfono debe ser un celular colombiano de 10 dígitos que empiece por 3');
const correo = z
  .string({ invalid_type_error: 'El correo debe ser texto' })
  .trim()
  .email('El correo no tiene un formato válido')
  .max(254)
  .nullable()
  .optional()
  .or(z.literal('').transform(() => null));

export const clienteNuevo = z.object({
  nombre,
  telefono,
  correo,
  autorizacionDatos: z.literal(true, {
    errorMap: () => ({ message: 'La autorización de tratamiento de datos es obligatoria (Ley 1581 de 2012)' }),
  }),
});

export const clienteCambios = z
  .object({ nombre: nombre.optional(), telefono: telefono.optional(), correo })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'Envía al menos un dato para actualizar' });

export const busquedaClientes = z.object({
  buscar: z.string().trim().max(60, 'La búsqueda admite máximo 60 caracteres').optional(),
});
