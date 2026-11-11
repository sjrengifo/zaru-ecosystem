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
  '/notificaciones': ['admin'],
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

/**
 * Página a la que se envía a alguien recién autenticado. Respeta la ruta que intentó abrir (`desde`)
 * solo si su rol puede verla: así, tras cerrar el superadmin e iniciar como admin, no se arrastra
 * `/superadmin` (que le daría "No tienes acceso") y cae en su propio inicio.
 */
export function destinoTrasLogin(rol, desde) {
  const pedida = desde && rutaNormalizada(desde) !== '/login' ? desde : null;
  return pedida && puedeAcceder(rol, pedida) ? pedida : rutaInicio(rol);
}
