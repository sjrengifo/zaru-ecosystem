// HU-31/HU-39 — Validación de preferencias de canales y de la prueba de envío.
// El establecimiento nunca viaja en el cuerpo: `req.tenant.rpc` lo toma de la sesión (HU-41).
import { z } from 'zod';
import { CANALES_PREFERENCIA } from '../shared/preferenciasCanales.js';

const canal = z.enum(CANALES_PREFERENCIA, {
  errorMap: () => ({ message: 'El canal debe ser sms, correo o push' }),
});

export const preferenciasCanales = z
  .object({
    canales: z
      .array(
        z.object({
          canal,
          activo: z.boolean({
            required_error: 'Cada canal debe indicar si está activo',
            invalid_type_error: 'El valor de activo debe ser verdadero o falso',
          }),
        }),
        { required_error: 'Envía la lista de canales', invalid_type_error: 'La preferencia debe ser una lista' },
      )
      .min(1, 'Envía al menos un canal')
      .max(CANALES_PREFERENCIA.length, 'Hay demasiados canales'),
  })
  .strict()
  .superRefine((valor, ctx) => {
    const vistos = new Set();
    valor.canales.forEach(({ canal: nombre }, indice) => {
      if (vistos.has(nombre)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `El canal ${nombre} está repetido`,
          path: ['canales', indice, 'canal'],
        });
      }
      vistos.add(nombre);
    });
  });

export const pruebaNotificacion = z
  .object({
    canal: canal.optional(),
  })
  .strict();
