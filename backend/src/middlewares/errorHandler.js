// Respuestas ordenadas cuando algo falla.
// Formato: { error: "mensaje para el usuario", codigo: "CODIGO_ESTABLE" }
import { AppError } from '../shared/errores.js';

export function rutaNoEncontrada(req, res) {
  res.status(404).json({ error: `Ruta no encontrada: ${req.method} ${req.originalUrl}`, codigo: 'NO_ENCONTRADO' });
}

// eslint-disable-next-line no-unused-vars
export function manejarErrores(err, req, res, next) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: err.message, codigo: err.codigo });
  }
  if (err?.status && err.status < 500) {
    return res.status(err.status).json({ error: err.message, codigo: err.codigo ?? 'VALIDACION' });
  }
  console.error(err);
  // No se exponen detalles internos (por ejemplo, mensajes de la base de datos).
  res.status(500).json({ error: 'Error interno del servidor', codigo: 'ERROR_INTERNO' });
}

/** Crea un error con código HTTP. Ej: throw crearError(400, 'Falta el nombre') */
export function crearError(status, mensaje) {
  const err = new Error(mensaje);
  err.status = status;
  return err;
}
