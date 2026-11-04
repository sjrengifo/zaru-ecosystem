// HU-02 — Menú del panel y qué opciones ve cada rol.
// Ocultar una opción no protege la ruta: el backend y RutaProtegida son la barrera real.
export const MENU = [
  { ruta: '/', texto: 'Dashboard' },
  { ruta: '/clientes', texto: 'Clientes' },
  { ruta: '/vehiculos', texto: 'Vehículos' },
  { ruta: '/servicios', texto: 'Servicios', soloAdmin: true },
  { ruta: '/promociones', texto: 'Promociones', soloAdmin: true },
  { ruta: '/usuarios', texto: 'Usuarios', soloAdmin: true },
  { ruta: '/reportes', texto: 'Reportes', soloAdmin: true },
  { ruta: '/branding', texto: 'Branding', soloAdmin: true },
];

export function menuParaRol(rol) {
  return MENU.filter((item) => !item.soloAdmin || rol === 'admin');
}
