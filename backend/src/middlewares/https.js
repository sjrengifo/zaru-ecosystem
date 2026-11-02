// HU-50 CA1 — En producción solo se aceptan peticiones por HTTPS.
// Render y Vercel terminan TLS en su proxy y reenvían x-forwarded-proto; con `trust proxy` activo,
// req.secure es true solo si el cliente se conectó por HTTPS. Una petición por HTTP ya expuso sus
// datos en la red, por eso no se redirige: se rechaza con 426 para que el cliente corrija la URL.
// Los health checks quedan exentos porque no transportan datos y el proveedor los hace internamente.
import { AppError } from '../shared/errores.js';

const EXENTAS = /^\/api(\/v\d+)?\/health$/;

export function exigirHttps({ produccion = process.env.NODE_ENV === 'production' } = {}) {
  return (req, res, next) => {
    if (!produccion || req.secure || EXENTAS.test(req.path)) return next();
    res.set('Upgrade', 'TLS/1.2, HTTP/1.1');
    res.set('Connection', 'Upgrade');
    next(new AppError('HTTPS_REQUERIDO', 'Conexión no cifrada rechazada: usa https://'));
  };
}
