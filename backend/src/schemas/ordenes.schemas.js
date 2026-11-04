// HU-08, HU-10 — Validación de las peticiones de órdenes.
import { z } from 'zod';

export const ESTADOS_ORDEN = ['recibido', 'en_lavado', 'listo', 'entregado'];

export const ordenNueva = z.object({
  vehiculoId: z.string({ required_error: 'Selecciona el vehículo' }).uuid('Vehículo inválido'),
  servicios: z
    .array(z.string().uuid('Servicio inválido'), { required_error: 'Selecciona al menos un servicio' })
    .min(1, 'Selecciona al menos un servicio')
    .max(20, 'Máximo 20 servicios por orden')
    .transform((ids) => [...new Set(ids)]),
});

export const cambioEstado = z.object({
  estado: z.enum(ESTADOS_ORDEN, { errorMap: () => ({ message: 'Estado inválido' }) }),
});

export const idOrden = z.object({ id: z.string().uuid('Orden no encontrada') });
