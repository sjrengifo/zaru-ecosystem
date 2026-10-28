// HU-43 CA2 — Validación de peticiones con zod.
// Si los datos no cumplen el esquema, responde 400 VALIDACION con la lista de campos a corregir.
// Si cumplen, reemplaza req.body / req.query por los datos ya limpios (sin campos desconocidos).
//
//   router.post('/', validar({ body: clienteNuevo }), ctrl.crear);
import { AppError } from './errores.js';

export function detallesDeZod(error, origen) {
  return error.issues.map((i) => ({
    campo: i.path.length ? i.path.join('.') : origen,
    mensaje: i.message,
  }));
}

export function validar(esquemas) {
  return (req, res, next) => {
    const detalles = [];
    for (const origen of ['params', 'query', 'body']) {
      if (!esquemas[origen]) continue;
      const resultado = esquemas[origen].safeParse(req[origen] ?? {});
      if (resultado.success) {
        // req.query es de solo lectura en Express 5; se define la propiedad para ser compatibles.
        Object.defineProperty(req, origen, { value: resultado.data, writable: true, configurable: true, enumerable: true });
      } else {
        detalles.push(...detallesDeZod(resultado.error, origen));
      }
    }
    if (detalles.length) return next(new AppError('VALIDACION', 'La solicitud tiene datos inválidos', detalles));
    next();
  };
}
