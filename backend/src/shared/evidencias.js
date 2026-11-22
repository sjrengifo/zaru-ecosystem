// HU-37 CA2 — Recepción de fotos de evidencia de una novedad.
import multer from 'multer';
import { AppError } from './errores.js';

export const MAX_FOTOS_NOVEDAD = 3;
export const TAMANO_MAXIMO_FOTO = 5 * 1024 * 1024;
const MENSAJE = 'Adjunta hasta 3 fotos JPG o PNG de máximo 5 MB cada una';

const lector = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: TAMANO_MAXIMO_FOTO, files: MAX_FOTOS_NOVEDAD, fields: 0 },
}).array('fotos', MAX_FOTOS_NOVEDAD);

export function formatoDeEvidencia(buffer) {
  if (buffer?.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => buffer[i] === b)) {
    return { extension: 'png', contentType: 'image/png' };
  }
  if (buffer?.length >= 3 && [0xff, 0xd8, 0xff].every((b, i) => buffer[i] === b)) {
    return { extension: 'jpg', contentType: 'image/jpeg' };
  }
  return null;
}

export const evidenciaInvalida = (mensaje = MENSAJE) =>
  new AppError('VALIDACION', mensaje, [{ campo: 'fotos', mensaje: MENSAJE }]);

export function recibirFotosNovedad(req, res, next) {
  lector(req, res, (err) => {
    if (!err) {
      if (!req.files?.length) return next(evidenciaInvalida('Selecciona al menos una foto'));
      const invalida = req.files.find((archivo) => !formatoDeEvidencia(archivo.buffer));
      if (invalida) return next(evidenciaInvalida('Cada archivo debe ser una imagen JPG o PNG válida'));
      return next();
    }
    if (err.code === 'LIMIT_FILE_SIZE') return next(evidenciaInvalida('Cada foto debe pesar máximo 5 MB'));
    if (err instanceof multer.MulterError || /multipart|boundary/i.test(err.message)) return next(evidenciaInvalida());
    return next(err);
  });
}
