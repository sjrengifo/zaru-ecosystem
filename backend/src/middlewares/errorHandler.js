// HU-43 CA2 — Respuestas de error con formato único (specs/backend/04-contrato-api.md):
//   { "error": { "codigo", "mensaje", "detalles"?, "requestId" } }
import { AppError } from '../shared/errores.js';

function responder(res, req, status, codigo, mensaje, detalles) {
  res.status(status).json({
    error: { codigo, mensaje, ...(detalles?.length ? { detalles } : {}), requestId: req.requestId },
  });
}

export function rutaNoEncontrada(req, res) {
  responder(res, req, 404, 'NO_ENCONTRADO', `Ruta no encontrada: ${req.method} ${req.originalUrl.split('?')[0]}`);
}

// eslint-disable-next-line no-unused-vars
export function manejarErrores(err, req, res, next) {
  if (err instanceof AppError) {
    return responder(res, req, err.status, err.codigo, err.message, err.detalles);
  }
  // Errores del lector de JSON de Express.
  if (err?.type === 'entity.parse.failed') {
    return responder(res, req, 400, 'VALIDACION', 'El cuerpo de la solicitud no es un JSON válido', [
      { campo: 'body', mensaje: 'Revisa comillas, comas y llaves del JSON' },
    ]);
  }
  if (err?.type === 'entity.too.large') {
    return responder(res, req, 413, 'CARGA_DEMASIADO_GRANDE', 'El cuerpo de la solicitud supera el tamaño máximo (1 MB)');
  }
  // Error no controlado: se registra completo en el servidor y el cliente solo recibe el requestId.
  console.error(`[${req.requestId}] ${req.method} ${req.originalUrl}`, err);
  responder(res, req, 500, 'ERROR_INTERNO', 'Error interno del servidor');
}
