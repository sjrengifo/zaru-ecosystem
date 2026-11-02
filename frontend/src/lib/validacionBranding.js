// HU-13 · Validación del logo y los colores antes de enviarlos (CA3). Usa los mismos requisitos y
// mensajes de la API, que vuelve a validar el archivo y decide.

export const REQUISITOS_LOGO = 'El logo debe ser una imagen PNG o JPG de máximo 2 MB';
export const TAMANO_MAXIMO_LOGO = 2 * 1024 * 1024;

const FORMATO_COLOR = /^#[0-9A-Fa-f]{6}$/;
const FIRMAS = [
  [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], // PNG
  [0xff, 0xd8, 0xff], // JPG
];

/** Mensaje de error del logo, o null si es válido. Revisa el contenido, no solo el nombre del archivo. */
export async function validarLogo(archivo) {
  if (!archivo) return 'Selecciona un archivo de logo';
  if (archivo.size > TAMANO_MAXIMO_LOGO) return 'El archivo supera 2 MB';
  const bytes = new Uint8Array(await archivo.slice(0, 8).arrayBuffer());
  const esImagen = FIRMAS.some((firma) => firma.every((b, i) => bytes[i] === b));
  return esImagen ? null : 'El archivo no es una imagen PNG o JPG';
}

export function validarColor(color, campo) {
  return FORMATO_COLOR.test(color) ? null : `${campo} debe tener el formato #RRGGBB, por ejemplo #2563EB`;
}

/** Contraste mínimo del texto normal según WCAG 2.x, nivel AA. */
export const CONTRASTE_MINIMO = 4.5;

/** Contraste del texto blanco sobre un color (WCAG 2.x). Por debajo de 4.5 el texto normal se lee mal. */
export function contrasteConBlanco(color) {
  if (!FORMATO_COLOR.test(color)) return 21;
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(color.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const luminancia = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return 1.05 / (luminancia + 0.05);
}

/** El tono más cercano al color, igual de matiz pero más oscuro, donde el texto blanco ya se lee bien. */
export function tonoLegible(color) {
  const canales = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
  for (let factor = 0.99; factor > 0; factor -= 0.01) {
    const hex = '#' + canales.map((c) => Math.round(c * factor).toString(16).padStart(2, '0')).join('').toUpperCase();
    if (contrasteConBlanco(hex) >= CONTRASTE_MINIMO) return hex;
  }
  return '#000000';
}
