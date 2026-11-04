import { z } from 'zod';

const correo = z.string().trim().email('Escribe un correo válido').max(254).transform((v) => v.toLowerCase());

export const PLANES = ['basico', 'intermedio', 'empresarial'];
export const ESTADOS_ESTABLECIMIENTO = ['prueba', 'activo', 'pendiente_activacion', 'suspendido'];

export const nuevoEstablecimiento = z.object({
  nombre: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres').max(120),
  plan: z.enum(PLANES, { errorMap: () => ({ message: 'Elige un plan: básico, intermedio o empresarial' }) }),
  correoAdministrador: correo,
  diasPrueba: z.coerce.number().int('Usa un número entero de días').min(14, 'Mínimo 14 días').max(30, 'Máximo 30 días'),
});

export const idEstablecimiento = z.object({
  id: z.string().uuid(),
});

/** Filtros del listado: ?estado=prueba&buscar=lavadero */
export const filtroEstablecimientos = z.object({
  estado: z.enum(ESTADOS_ESTABLECIMIENTO).optional(),
  buscar: z.string().trim().max(120).optional().transform((v) => v || undefined),
});

/** Motivo opcional al suspender; queda en la auditoría. */
export const cambioEstadoEstablecimiento = z.object({
  motivo: z.string().trim().max(300).optional().transform((v) => v || undefined),
});
