// Respuesta temporal para rutas que aún no se han desarrollado (documentadas como 501 en openapi.yaml).
import { AppError } from '../shared/errores.js';

export const pendiente = (hu) => (req, res, next) => next(new AppError('NO_IMPLEMENTADO', `Pendiente de desarrollo (${hu})`));
