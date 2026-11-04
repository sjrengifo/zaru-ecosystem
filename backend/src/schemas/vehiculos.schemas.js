// HU-05 — Esquemas de validación de vehículos (HU-43 CA2).
import { z } from 'zod';

const MENSAJE_PLACA = {
  carro: 'La placa de un carro debe tener el formato ABC123',
  moto: 'La placa de una moto debe tener el formato ABC12D o ABC12',
};
const FORMATO_PLACA = { carro: /^[A-Z]{3}\d{3}$/, moto: /^[A-Z]{3}\d{2}[A-Z]?$/ };

const opcional = (campo, max) =>
  z
    .string({ invalid_type_error: `${campo} debe ser texto` })
    .trim()
    .max(max, `${campo} admite máximo ${max} caracteres`)
    .transform((valor) => valor || null)
    .nullable()
    .optional();

export const vehiculoNuevo = z
  .object({
    clienteId: z.string({ required_error: 'Indica el cliente del vehículo', invalid_type_error: 'El cliente debe ser texto' }),
    // RF-F2-11: se guarda en mayúsculas, sin espacios ni guiones.
    placa: z
      .string({ required_error: 'La placa es obligatoria', invalid_type_error: 'La placa debe ser texto' })
      .transform((placa) => placa.replace(/[\s-]/g, '').toUpperCase())
      .refine((placa) => placa.length > 0, 'La placa es obligatoria'),
    tipo: z.enum(['carro', 'moto'], {
      errorMap: () => ({ message: 'Indica si el vehículo es carro o moto' }),
    }),
    marca: opcional('La marca', 40),
    color: opcional('El color', 30),
  })
  .superRefine(({ placa, tipo }, ctx) => {
    if (placa && !FORMATO_PLACA[tipo].test(placa)) ctx.addIssue({ code: 'custom', path: ['placa'], message: MENSAJE_PLACA[tipo] });
  });

export const busquedaVehiculos = z.object({
  placa: z.string().trim().max(20, 'La búsqueda admite máximo 20 caracteres').optional(),
});
