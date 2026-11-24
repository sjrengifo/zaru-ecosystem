// HU-39 — Validación de periodo, establecimiento y cupos del catálogo de planes.
import { z } from 'zod';

export const PLANES = ['basico', 'intermedio', 'empresarial'];

export const mesConsumo = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM (por ejemplo, 2026-11)');

export const filtroConsumo = z
  .object({
    mes: mesConsumo.optional(),
    // Solo filtra el reporte global; las rutas de sede lo ignoran porque el tenant sale de la sesión.
    establecimientoId: z.string().uuid('El establecimiento debe ser un UUID válido').optional(),
  })
  .strict();

export const idEstablecimientoConsumo = z.object({
  establecimientoId: z.string().uuid('El establecimiento debe ser un UUID válido'),
});

export const nombrePlan = z.object({
  nombre: z.enum(PLANES, { errorMap: () => ({ message: 'Elige un plan: básico, intermedio o empresarial' }) }),
});

export const cuposPlan = z
  .object({
    cupoSmsMes: z.number().int().min(0, 'El cupo de SMS no puede ser negativo').optional(),
    // null significa "sin límite configurado" y solo aplica al correo.
    cupoCorreoMes: z.number().int().min(0, 'El cupo de correos no puede ser negativo').nullable().optional(),
  })
  .strict()
  .refine((datos) => Object.keys(datos).length > 0, 'Indica al menos un cupo para actualizar');
