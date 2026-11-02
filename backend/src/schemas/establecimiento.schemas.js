// HU-13 — Esquemas de validación del branding (HU-43 CA2).
import { z } from 'zod';

const color = (campo) =>
  z
    .string({ required_error: `${campo} es obligatorio`, invalid_type_error: `${campo} debe ser texto` })
    .trim()
    .regex(/^#[0-9A-Fa-f]{6}$/, `${campo} debe tener el formato #RRGGBB, por ejemplo #2563EB`)
    .transform((valor) => valor.toUpperCase());

// RF-F4-08: color primario y secundario en hexadecimal.
export const branding = z.object({
  colorPrimario: color('El color primario'),
  colorSecundario: color('El color secundario'),
});
