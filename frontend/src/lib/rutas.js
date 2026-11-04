// HU-02 CA2 — Política de acceso a las páginas del panel.
// Ocultar una opción del menú no protege la ruta: RutaProtegida consulta esta
// política también cuando alguien escribe la URL directamente en el navegador.
export const RUTAS = {
  '/': ['admin', 'operario'],
  '/clientes': ['admin', 'operario'],
  '/vehiculos': ['admin', 'operario'],
  '/servicios': ['admin'],
  '/promociones': ['admin'],
  '/usuarios': ['admin'],
  '/reportes': ['admin'],
  '/branding': ['admin'],
  '/aceptar-invitacion': ['admin', 'operario'],
  '/superadmin': ['superadmin'],
};

/** Normaliza la URL para que /servicios/, /servicios?x=1 y /servicios sean la misma ruta. */
export function rutaNormalizada(ruta) {
  const sinConsulta = String(ruta ?? '').split(/[?#]/)[0];
  if (!sinConsulta.startsWith('/')) return '/';
  return sinConsulta.length > 1 ? sinConsulta.replace(/\/+$/, '') : '/';
}

/** Roles autorizados para una ruta. Una ruta desconocida no la abre ningún rol. */
export function rolesDeRuta(ruta) {
  return RUTAS[rutaNormalizada(ruta)] ?? [];
}

export function puedeAcceder(rol, ruta) {
  return rolesDeRuta(ruta).includes(rol);
}

/** Página inicial de cada rol: el superadministrador no entra al panel operativo. */
export function rutaInicio(rol) {
  return rol === 'superadmin' ? '/superadmin' : '/';
}
