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

// HU-38: aviso del centro de notificaciones del cliente.
export const idNotificacionCliente = z.object({
  id: z.string().uuid('El identificador de la notificación no es válido'),
});

// HU-29: preferencias de canal del cliente (CA3: `confirmarSinCanales` confirma dejar todo desactivado).
const casilla = (mensaje) => z.boolean({ required_error: mensaje, invalid_type_error: mensaje });

export const preferenciasCanal = z.object({
  push: casilla('Indica si quieres recibir avisos push'),
  sms: casilla('Indica si quieres recibir avisos por sms'),
  correo: casilla('Indica si quieres recibir avisos por correo'),
  confirmarSinCanales: z.boolean({ invalid_type_error: 'La confirmación debe ser verdadero o falso' }).optional(),
});

// HU-29 CA2: celular para el sms. Si no se envía, se usa el celular con el que el cliente está registrado.
export const solicitudCodigoSms = z.object({
  celular: z
    .string({ invalid_type_error: 'Escribe el celular de 10 dígitos, por ejemplo 3001234567' })
    .trim()
    .optional()
    .transform((valor) => (valor ? normalizarCelular(valor) : undefined))
    .refine((valor) => valor !== null, { message: 'Escribe el celular de 10 dígitos, por ejemplo 3001234567' }),
});

// HU-29 CA2: código de 6 dígitos que llegó por sms.
export const confirmacionCodigoSms = z.object({
  codigo: z
    .string({ required_error: 'Escribe el código de 6 dígitos', invalid_type_error: 'Escribe el código de 6 dígitos' })
    .trim()
    .regex(/^\d{6}$/, 'El código tiene 6 dígitos'),
});
