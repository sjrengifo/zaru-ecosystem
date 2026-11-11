// HU-34 (HU-43 CA2) — Validación de los filtros de la bitácora de notificaciones.
// Todos los filtros son opcionales y se pueden combinar. Las fechas son días AAAA-MM-DD en hora
// de Bogotá; el controlador las convierte al rango completo del día.
import { z } from 'zod';
import { normalizarPlaca } from '../shared/accesoCliente.js';

const FORMATO_DIA = /^\d{4}-\d{2}-\d{2}$/;

function esDiaReal(texto) {
  const [anio, mes, dia] = texto.split('-').map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  return fecha.getUTCFullYear() === anio && fecha.getUTCMonth() === mes - 1 && fecha.getUTCDate() === dia;
}

const dia = (nombre) =>
  z
    .string({ invalid_type_error: `La fecha de ${nombre} debe tener el formato AAAA-MM-DD` })
    .trim()
    .regex(FORMATO_DIA, `La fecha de ${nombre} debe tener el formato AAAA-MM-DD`)
    .refine(esDiaReal, `La fecha de ${nombre} no es válida`)
    .optional();

const placa = z
  .string({ invalid_type_error: 'La placa debe ser texto' })
  .trim()
  .optional()
  .transform((valor) => (valor ? normalizarPlaca(valor) : undefined))
  .refine((valor) => valor !== null, { message: 'Escribe la placa sin espacios, por ejemplo ABC123' });

export const filtroNotificaciones = z
  .object({
    placa,
    desde: dia('inicio'),
    hasta: dia('fin'),
    canal: z.enum(['push', 'sms', 'correo']).optional(),
    estado: z.enum(['programada', 'pendiente', 'enviando', 'enviada', 'entregada', 'fallida', 'cancelada']).optional(),
    tipo: z.enum(['operativa', 'comercial', 'recordatorio', 'novedad', 'correccion', 'sistema']).optional(),
    pagina: z.coerce.number().int().min(1).default(1),
    porPagina: z.coerce.number().int().min(1).max(50).default(20),
  })
  .refine(({ desde, hasta }) => !desde || !hasta || desde <= hasta, {
    path: ['desde'],
    message: 'La fecha de inicio no puede ser posterior a la fecha de fin',
  });

export const idNotificacion = z.object({
  id: z.string().uuid('El identificador de la notificación no es válido'),
});
