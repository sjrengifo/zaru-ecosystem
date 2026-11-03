import { z } from 'zod';

const correo = z.string().trim().email().max(254).transform((v) => v.toLowerCase());

export const nuevoEstablecimiento = z.object({
  nombre: z.string().trim().min(2).max(120),
  plan: z.enum(['basico', 'intermedio', 'empresarial']),
  correoAdministrador: correo,
  diasPrueba: z.coerce.number().int().min(14).max(30),
});

export const idEstablecimiento = z.object({
  id: z.string().uuid(),
});
