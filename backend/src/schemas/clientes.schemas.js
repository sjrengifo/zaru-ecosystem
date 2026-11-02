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
// Obligatorio desde la política 1.1: es un canal de notificación (HU-46). El pipe evita dos errores para un correo vacío.
const correo = z
  .string({ required_error: 'El correo es obligatorio', invalid_type_error: 'El correo debe ser texto' })
  .trim()
  .min(1, 'El correo es obligatorio')
  .pipe(z.string().email('El correo no tiene un formato válido').max(254, 'El correo admite máximo 254 caracteres'));

export const clienteNuevo = z.object({
  nombre,
  telefono,
  correo,
  autorizacionDatos: z.literal(true, {
    errorMap: () => ({ message: 'La autorización de tratamiento de datos es obligatoria (Ley 1581 de 2012)' }),
  }),
  // HU-51 CA2: versión de la política que el titular vio y aceptó (GET /politicas-datos/vigente).
  politicaVersion: z
    .string({ required_error: 'Indica la versión de la política de datos aceptada', invalid_type_error: 'La versión de la política debe ser texto' })
    .regex(/^\d+\.\d+$/, 'La versión de la política debe tener el formato 1.0'),
});

export const clienteCambios = z
  .object({ nombre: nombre.optional(), telefono: telefono.optional(), correo: correo.optional() })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'Envía al menos un dato para actualizar' });

export const busquedaClientes = z.object({
  buscar: z.string().trim().max(60, 'La búsqueda admite máximo 60 caracteres').optional(),
});
