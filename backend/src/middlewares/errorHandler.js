// Respuestas ordenadas cuando algo falla.

export function rutaNoEncontrada(req, res) {
  res.status(404).json({ error: `Ruta no encontrada: ${req.method} ${req.originalUrl}` });
}

// eslint-disable-next-line no-unused-vars
export function manejarErrores(err, req, res, next) {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Error interno del servidor' });
}

/** Crea un error con código HTTP. Ej: throw crearError(400, 'Falta el nombre') */
export function crearError(status, mensaje) {
  const err = new Error(mensaje);
  err.status = status;
  return err;
}
