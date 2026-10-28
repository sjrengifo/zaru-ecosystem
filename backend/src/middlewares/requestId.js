// Identificador único por petición: se devuelve en X-Request-Id y se guarda en la auditoría
// para rastrear una acción desde el panel hasta los registros del servidor.
import { randomUUID } from 'node:crypto';

const VALIDO = /^[\w-]{8,64}$/;

export function requestId(req, res, next) {
  const recibido = req.get('x-request-id');
  req.requestId = recibido && VALIDO.test(recibido) ? recibido : randomUUID();
  res.set('X-Request-Id', req.requestId);
  next();
}
