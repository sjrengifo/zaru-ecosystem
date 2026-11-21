// HU-23 / HU-24 (HU-43 CA2) — Validación del acceso y los filtros del historial del cliente final.
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

// RF-F5-11 / RF-F5-12: el cliente entra con su celular y el código de 6 dígitos que le llega por SMS.
const MENSAJE_CELULAR = 'Escribe el celular de 10 dígitos con el que te registraste, por ejemplo 3001234567';

export const solicitudOtp = z.object({
  celular: celularNormalizado(MENSAJE_CELULAR),
  // Cómo quiere recibir el código; sin indicarlo, por SMS.
  canal: z.enum(['sms', 'correo'], { errorMap: () => ({ message: 'Elige recibir el código por sms o por correo' }) }).default('sms'),
});

export const verificacionOtp = z.object({
  celular: celularNormalizado(MENSAJE_CELULAR),
  codigo: z
    .string({ required_error: 'Escribe el código de 6 dígitos', invalid_type_error: 'Escribe el código de 6 dígitos' })
    .trim()
    .regex(/^\d{6}$/, 'El código tiene 6 dígitos'),
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

// HU-38: aviso del centro de notificaciones del cliente.
export const idNotificacionCliente = z.object({
  id: z.string().uuid('El identificador de la notificación no es válido'),
});
