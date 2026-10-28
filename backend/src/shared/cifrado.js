// HU-50 CA2 — Cifrado a nivel de campo con AES-256-GCM para datos personales sensibles.
//
// Supabase ya cifra el disco completo (AES-256). Este cifrado adicional protege campos puntuales
// (por ahora el correo del cliente) para que no sean legibles en la base, en copias de seguridad
// ni en el panel de Supabase sin la clave, que vive solo en el gestor de secretos (ZARU_CLAVE_CIFRADO).
//
// Formato guardado: "v1:" + base64( iv[12] | tag[16] | texto cifrado ). El prefijo de versión permite
// rotar el algoritmo o la clave más adelante sin romper los valores existentes.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const PREFIJO = 'v1:';

function clave() {
  const valor = process.env.ZARU_CLAVE_CIFRADO;
  const bytes = valor ? Buffer.from(valor, 'base64') : null;
  if (!bytes || bytes.length !== 32) {
    throw new Error('ZARU_CLAVE_CIFRADO no está configurada o no es una clave de 32 bytes en base64');
  }
  return bytes;
}

export const estaCifrado = (valor) => typeof valor === 'string' && valor.startsWith(PREFIJO);

/** Cifra un texto. null y undefined se conservan tal cual. */
export function cifrar(texto) {
  if (texto === null || texto === undefined) return texto;
  const iv = randomBytes(12);
  const cifrador = createCipheriv('aes-256-gcm', clave(), iv);
  const cuerpo = Buffer.concat([cifrador.update(String(texto), 'utf8'), cifrador.final()]);
  return PREFIJO + Buffer.concat([iv, cifrador.getAuthTag(), cuerpo]).toString('base64');
}

/**
 * Descifra un valor. Un valor sin prefijo se devuelve igual (datos anteriores al cifrado,
 * pendientes de migrar con scripts/cifrar-correos.mjs). Si el valor fue alterado, lanza un error.
 */
export function descifrar(valor) {
  if (!estaCifrado(valor)) return valor;
  const datos = Buffer.from(valor.slice(PREFIJO.length), 'base64');
  const descifrador = createDecipheriv('aes-256-gcm', clave(), datos.subarray(0, 12));
  descifrador.setAuthTag(datos.subarray(12, 28));
  return Buffer.concat([descifrador.update(datos.subarray(28)), descifrador.final()]).toString('utf8');
}

/** Devuelve una copia del objeto con los campos indicados descifrados. */
export function descifrarCampos(fila, campos = ['correo']) {
  if (!fila) return fila;
  const copia = { ...fila };
  for (const campo of campos) if (campo in copia) copia[campo] = descifrar(copia[campo]);
  return copia;
}
