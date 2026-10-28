// HU-43 CA2 — Errores de la API con formato y códigos estándar (specs/backend/04-contrato-api.md).
//
// Formato de toda respuesta de error:
//   { "error": { "codigo": "VALIDACION", "mensaje": "…", "detalles": [{ "campo": "nombre", "mensaje": "…" }], "requestId": "…" } }

export const CODIGOS = {
  VALIDACION: 400,
  NO_AUTENTICADO: 401,
  SIN_PERMISO: 403,
  NO_ENCONTRADO: 404,
  CONFLICTO: 409,
  CARGA_DEMASIADO_GRANDE: 413,
  IDEMPOTENCIA_CONFLICTO: 422,
  LIMITE_EXCEDIDO: 429,
  ERROR_INTERNO: 500,
  NO_IMPLEMENTADO: 501,
};

export class AppError extends Error {
  /**
   * @param {keyof CODIGOS} codigo
   * @param {string} mensaje mensaje para el usuario, sin detalles internos
   * @param {Array<{campo?: string, mensaje: string}>} [detalles] qué corregir
   */
  constructor(codigo, mensaje, detalles) {
    super(mensaje);
    this.codigo = codigo;
    this.status = CODIGOS[codigo] ?? 500;
    this.detalles = detalles;
  }
}

/**
 * HU-41 CA2: la respuesta para un recurso de otro establecimiento es idéntica a la de un
 * recurso inexistente. Por eso el mensaje es genérico por recurso y nunca incluye el id.
 */
export const noEncontrado = (recurso = 'Recurso') => new AppError('NO_ENCONTRADO', `${recurso} no encontrado`);
