// HU-13 CA1 y CA3 — Recepción y validación del logo de la sede.
// El formato se decide por el contenido del archivo (firma binaria), no por su nombre ni por el
// tipo que declara el navegador: un .txt renombrado a .png se rechaza (RNF-F4-01).
import multer from 'multer';
import { AppError } from './errores.js';

export const TAMANO_MAXIMO_LOGO = 2 * 1024 * 1024;
export const REQUISITOS_LOGO = 'El logo debe ser una imagen PNG o JPG de máximo 2 MB';

const FIRMAS = [
  { formato: 'png', contentType: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { formato: 'jpg', contentType: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
];

/** Formato real del archivo según sus primeros bytes, o null si no es PNG ni JPG. */
export function formatoDeLogo(buffer) {
  const firma = FIRMAS.find(({ bytes }) => buffer?.length >= bytes.length && bytes.every((b, i) => buffer[i] === b));
  return firma ? { formato: firma.formato, contentType: firma.contentType } : null;
}

export const logoInvalido = (mensaje = REQUISITOS_LOGO) => new AppError('VALIDACION', mensaje, [{ campo: 'logo', mensaje: REQUISITOS_LOGO }]);

const lector = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: TAMANO_MAXIMO_LOGO, files: 1, fields: 0 },
}).single('logo');

/** Lee el campo `logo` de un multipart/form-data en memoria. Cualquier problema del archivo responde 400 con los requisitos. */
export function recibirLogo(req, res, next) {
  lector(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') return next(logoInvalido('El archivo supera 2 MB'));
    if (err instanceof multer.MulterError || /multipart|boundary/i.test(err.message)) return next(logoInvalido());
    next(err);
  });
}
