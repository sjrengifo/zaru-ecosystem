// HU-31 — Validación de la configuración de estados que generan notificación (HU-43 CA2).
import { z } from 'zod';
import { ESTADOS_NOTIFICACION, ESTADO_OBLIGATORIO } from '../shared/configNotificaciones.js';

const interruptor = z.object(
  {
    estado: z.enum(ESTADOS_NOTIFICACION, {
      errorMap: (issue) => ({
        message:
          issue.code === 'invalid_type'
            ? 'Cada interruptor debe indicar un estado'
            : 'El estado no es válido',
      }),
    }),
    activo: z.boolean({
      required_error: 'Cada interruptor debe indicar si está activo',
      invalid_type_error: 'El valor de activo debe ser verdadero o falso',
    }),
  },
  { required_error: 'Envía la lista de estados', invalid_type_error: 'La configuración debe ser una lista' },
);

export const configuracionNotificaciones = z
  .array(interruptor, {
    required_error: 'Envía la lista de estados',
    invalid_type_error: 'La configuración debe ser una lista',
  })
  .min(1, 'Envía al menos un estado')
  .max(ESTADOS_NOTIFICACION.length, `Solo hay ${ESTADOS_NOTIFICACION.length} estados en el flujo`)
  .superRefine((items, ctx) => {
    const vistos = new Set();
    items.forEach((item, indice) => {
      if (vistos.has(item.estado)) {
        ctx.addIssue({
          code: 'custom',
          path: [indice, 'estado'],
          message: `El estado ${item.estado} está repetido`,
        });
      }
      vistos.add(item.estado);

      // CA2: el estado obligatorio no se puede apagar.
      if (item.estado === ESTADO_OBLIGATORIO && item.activo === false) {
        ctx.addIssue({
          code: 'custom',
          path: [indice, 'activo'],
          message: 'El estado "listo" es obligatorio y no se puede desactivar',
        });
      }
    });
  });
