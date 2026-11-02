// HU-13 · Copia local del branding de la sede para que, al recargar, el panel aparezca de una vez con
// su logo y sus colores, sin mostrar antes los de Zaru. La API sigue siendo la fuente: la copia se
// reemplaza en cuanto llega la respuesta, y se borra al cerrar sesión. Solo guarda datos públicos.
const CLAVE = 'zaru:branding';

export function leerBranding() {
  try {
    return JSON.parse(localStorage.getItem(CLAVE)) ?? null;
  } catch {
    return null; // localStorage no disponible (modo privado) o dato dañado: se espera a la API.
  }
}

export function guardarBranding({ nombre, logo_url, color_primario, color_secundario }) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify({ nombre, logo_url, color_primario, color_secundario }));
  } catch {
    // Sin almacenamiento local el panel funciona igual; solo no se adelanta el branding.
  }
}

export function borrarBranding() {
  try {
    localStorage.removeItem(CLAVE);
  } catch {
    // Nada que borrar.
  }
}
