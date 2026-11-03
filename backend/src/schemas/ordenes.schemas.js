// HU-08 y HU-10 — Registro de ingreso de un vehículo y cambio de estado de la orden (HU-43 CA2).
import { z } from 'zod';
import { clienteNuevo } from './clientes.schemas.js';
import { datosVehiculo } from './vehiculos.schemas.js';

export const estadosOrden = ['recibido', 'en_lavado', 'secado', 'listo', 'entregado'];

const servicioId = z
  .string({ required_error: 'Indica los servicios de la orden', invalid_type_error: 'Cada servicio debe ser un identificador' })
  .uuid('Uno de los servicios no tiene un identificador válido');

const servicioIds = z
  .array(servicioId, { required_error: 'Elige al menos un servicio', invalid_type_error: 'Los servicios deben venir en una lista' })
  .min(1, 'Elige al menos un servicio')
  .transform((ids) => [...new Set(ids)]);

export const ordenNueva = z
  .object({
    /** Vehículo ya registrado en el establecimiento. */
    vehiculoId: z
      .string({ invalid_type_error: 'El vehículo debe ser un identificador' })
      .uuid('El vehículo no tiene un identificador válido')
      .optional(),
    /** HU-08 CA2: placa nueva; el cliente y el vehículo se crean en la misma operación. */
    nuevoVehiculo: z
      .object(
        {
          cliente: clienteNuevo,
          vehiculo: datosVehiculo,
        },
        { required_error: 'Indica los datos del cliente y del vehículo', invalid_type_error: 'Los datos del vehículo nuevo no son válidos' },
      )
      .optional(),
    servicioIds,
    observaciones: z
      .string({ invalid_type_error: 'Las observaciones deben ser texto' })
      .trim()
      .max(500, 'Las observaciones admiten máximo 500 caracteres')
      .transform((valor) => valor || null)
      .nullable()
      .optional(),
  })
  .superRefine(({ vehiculoId, nuevoVehiculo }, ctx) => {
    if (vehiculoId && nuevoVehiculo) {
      ctx.addIssue({
        code: 'custom',
        path: ['vehiculoId'],
        message: 'Indica un vehículo registrado o uno nuevo, pero no ambos',
      });
    }
    if (!vehiculoId && !nuevoVehiculo) {
      ctx.addIssue({
        code: 'custom',
        path: ['vehiculoId'],
        message: 'Indica el vehículo registrado o los datos del vehículo nuevo',
      });
    }
  });

/** HU-10: avanzar al siguiente estado o revertir el último cambio (HU-28 CA3). */
export const cambioEstadoOrden = z
  .object({
    estado: z
      .enum(estadosOrden, {
        required_error: 'Indica el estado al que quieres avanzar',
        invalid_type_error: 'El estado no es válido',
      })
      .optional(),
    revertir: z
      .boolean({ invalid_type_error: 'El valor de revertir debe ser verdadero o falso' })
      .optional(),
  })
  .superRefine(({ estado, revertir }, ctx) => {
    if (revertir === true && estado) {
      ctx.addIssue({
        code: 'custom',
        path: ['estado'],
        message: 'Indica un estado nuevo o revertir el último cambio, pero no ambos',
      });
      return;
    }
    if (revertir !== true && !estado) {
      ctx.addIssue({
        code: 'custom',
        path: ['estado'],
        message: 'Indica el estado al que quieres avanzar',
      });
    }
  });
