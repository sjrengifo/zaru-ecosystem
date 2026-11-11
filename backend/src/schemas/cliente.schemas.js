// HU-23 / HU-24 (HU-43 CA2) — Validación del acceso y los filtros del historial del cliente final.
// El cliente demuestra que es dueño del vehículo con la placa y el celular registrados en la sede.
import { z } from 'zod';
import { normalizarCelular, normalizarPlaca } from '../shared/accesoCliente.js';

const placaNormalizada = (mensaje) =>
  z
    .string({ required_error: mensaje, invalid_type_error: mensaje })
    .trim()
    .transform((valor) => normalizarPlaca(valor))
    .refine((valor) => valor !== null, { message: mensaje });

const celularNormalizado = (mensaje) =>
  z
    .string({ required_error: mensaje, invalid_type_error: mensaje })
    .trim()
    .transform((valor) => normalizarCelular(valor))
    .refine((valor) => valor !== null, { message: mensaje });

export const accesoHistorial = z.object({
  placa: placaNormalizada('Escribe la placa sin espacios, por ejemplo ABC123'),
  celular: celularNormalizado('Escribe el celular de 10 dígitos con el que registraste el vehículo'),
});

export const filtroHistorial = z.object({
  placa: z
    .string()
    .trim()
    .optional()
    .transform((valor) => (valor ? normalizarPlaca(valor) : undefined))
    .refine((valor) => valor !== null, { message: 'Escribe la placa sin espacios, por ejemplo ABC123' }),
});

export const idOrden = z.object({
  ordenId: z.string().uuid('El identificador del servicio no es válido'),
});
