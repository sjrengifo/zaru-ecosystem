// HU-35 — Validación de las campañas de promociones (HU-43 CA2).
import { z } from 'zod';

const UUID = 'El identificador no es válido';

// RF-F7-06: el segmento se arma con días sin visita, servicios usados y tipo de vehículo.
const segmento = z.object(
  {
    diasSinVisita: z.union([z.literal(30), z.literal(60), z.literal(90)], {
      errorMap: () => ({ message: 'Los días sin visita deben ser 30, 60 o 90' }),
    }),
    servicioIds: z
      .array(z.string().uuid('Uno de los servicios elegidos no es válido'), {
        invalid_type_error: 'Los servicios deben ser una lista',
      })
      .max(50, 'Puedes elegir hasta 50 servicios')
      .transform((ids) => [...new Set(ids)])
      .default([]),
    tiposVehiculo: z
      .array(
        z
          .string({ invalid_type_error: 'El tipo de vehículo debe ser texto' })
          .trim()
          .min(1, 'El tipo de vehículo no puede estar vacío')
          .max(40, 'El tipo de vehículo admite máximo 40 caracteres'),
        { invalid_type_error: 'Los tipos de vehículo deben ser una lista' },
      )
      .max(20, 'Puedes elegir hasta 20 tipos de vehículo')
      .transform((tipos) => [...new Set(tipos.map((t) => t.toLowerCase()))])
      .default([]),
  },
  { required_error: 'El segmento es obligatorio', invalid_type_error: 'El segmento no es válido' },
);

const promocionId = z.string({ required_error: 'Elige una promoción', invalid_type_error: 'La promoción no es válida' }).uuid('La promoción no es válida');

export const estimarCampana = z.object({ promocionId, segmento });

export const crearCampana = z.object({
  promocionId,
  segmento,
  // RF-F7-09: la API ajusta la hora si cae entre las 8:00 p. m. y las 7:00 a. m. de Bogotá.
  programadaPara: z
    .string({ invalid_type_error: 'La fecha de programación debe ser texto' })
    .datetime({ offset: true, message: 'La fecha de programación debe estar en formato ISO 8601' })
    .optional(),
});

export const filtroCampanas = z.object({
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(50).default(20),
});

export { UUID };
