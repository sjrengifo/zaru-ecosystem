// HU-14: interpreta lo que Supabase Auth agrega a la URL al volver del correo.
// El enlace válido llega con #type=recovery; uno vencido o usado llega con #error_code=...
// Se lee al cargar el módulo porque Supabase limpia el hash cuando procesa la sesión.

const CLAVE_RECUPERACION = 'zaru:recuperacion';

/** Analiza una URL y devuelve si es un enlace de recuperación o el error que trae. */
export function leerEnlaceAuth(url = typeof window !== 'undefined' ? window.location.href : '') {
  const vacio = { recuperacion: false, errorCodigo: '', errorDescripcion: '' };
  if (!url) return vacio;

  let destino;
  try {
    destino = new URL(url, 'http://localhost');
  } catch {
    return vacio;
  }

  const hash = new URLSearchParams(destino.hash.replace(/^#/, ''));
  const valor = (nombre) => hash.get(nombre) ?? destino.searchParams.get(nombre);

  return {
    recuperacion: valor('type') === 'recovery',
    errorCodigo: valor('error_code') || valor('error') || '',
    errorDescripcion: valor('error_description') || '',
  };
}

export const enlaceAuth = leerEnlaceAuth();

// Se guarda solo la marca de "hay un restablecimiento en curso" (sin tokens)
// para que recargar la página o abrirla en otra pestaña no invalide el enlace
// mientras se escribe la nueva contraseña.
export function hayRecuperacionGuardada() {
  try {
    return localStorage.getItem(CLAVE_RECUPERACION) === '1';
  } catch {
    return false;
  }
}

export function marcarRecuperacion() {
  try {
    localStorage.setItem(CLAVE_RECUPERACION, '1');
  } catch {
    // sin localStorage el flujo sigue funcionando mientras no se recargue
  }
}

export function limpiarRecuperacion() {
  try {
    localStorage.removeItem(CLAVE_RECUPERACION);
  } catch {
    // nada que limpiar
  }
}
