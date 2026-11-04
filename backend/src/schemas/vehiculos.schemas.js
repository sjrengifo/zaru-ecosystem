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

// RF-F2-11: se guarda en mayúsculas, sin espacios ni guiones.
const placa = z
  .string({ required_error: 'La placa es obligatoria', invalid_type_error: 'La placa debe ser texto' })
  .transform((valor) => valor.replace(/[\s-]/g, '').toUpperCase())
  .refine((valor) => valor.length > 0, 'La placa es obligatoria');
const tipo = z.enum(['carro', 'moto'], {
  errorMap: () => ({ message: 'Indica si el vehículo es carro o moto' }),
});
const marca = opcional('La marca', 40);
const color = opcional('El color', 30);

const validarPlaca = ({ placa: valor, tipo: clase }, ctx) => {
  if (valor && !FORMATO_PLACA[clase].test(valor)) {
    ctx.addIssue({ code: 'custom', path: ['placa'], message: MENSAJE_PLACA[clase] });
  }
};

/** Datos del vehículo sin el cliente; se reutilizan al crear la orden con un vehículo nuevo (HU-08). */
export const datosVehiculo = z.object({ placa, tipo, marca, color }).superRefine(validarPlaca);

export const vehiculoNuevo = z
  .object({
    clienteId: z.string({ required_error: 'Indica el cliente del vehículo', invalid_type_error: 'El cliente debe ser texto' }),
    placa,
    tipo,
    marca,
    color,
  })
  .superRefine(validarPlaca);

export const busquedaVehiculos = z.object({
  placa: z.string().trim().max(20, 'La búsqueda admite máximo 20 caracteres').optional(),
});
