// HU-32 — Validación de las peticiones de plantillas de notificación.
// El largo por canal y las variables las valida el motor (shared/plantillasNotificacion.js), que
// devuelve la variable inválida con su posición (CA4).
import { z } from 'zod';
import { CANALES, ESTADOS } from '../shared/plantillasNotificacion.js';

const estado = z.enum(Object.keys(ESTADOS), { errorMap: () => ({ message: 'El estado de la plantilla no es válido' }) });
const canal = z.enum(CANALES, { errorMap: () => ({ message: 'El canal debe ser push, sms o correo' }) });

const texto = z.object({
  asunto: z.string({ invalid_type_error: 'El asunto debe ser texto' }).max(500).nullish(),
  cuerpo: z.string({ required_error: 'Escribe el texto del mensaje', invalid_type_error: 'El texto debe ser texto' }).max(5000),
});

export const plantillaParams = z.object({ estado, canal });
export const guardarPlantilla = texto;
export const vistaPrevia = texto.extend({ estado, canal });
