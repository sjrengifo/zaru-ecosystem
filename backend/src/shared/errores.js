// Errores de la API con un código estable que el frontend y las pruebas pueden reconocer.
// El formato completo del contrato (04-contrato-api.md) se termina en HU-43.

export const CODIGOS = {
  VALIDACION: 400,
  NO_AUTENTICADO: 401,
  SIN_PERMISO: 403,
  NO_ENCONTRADO: 404,
  CONFLICTO: 409,
  ERROR_INTERNO: 500,
  NO_IMPLEMENTADO: 501,
};

export class AppError extends Error {
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
