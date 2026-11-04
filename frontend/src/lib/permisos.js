// HU-59 — Módulos del panel por rol. La fuente de verdad es la API (GET /me → permisos), que
// también los aplica en cada endpoint; esta copia solo se usa si la respuesta no los trae.
// Ocultar una opción del menú es comodidad: la seguridad real la da la API (403).

export const MENU = [
  { modulo: 'dashboard', ruta: '/', texto: 'Dashboard' },
  { modulo: 'clientes', ruta: '/clientes', texto: 'Clientes' },
  { modulo: 'vehiculos', ruta: '/vehiculos', texto: 'Vehículos' },
  { modulo: 'servicios', ruta: '/servicios', texto: 'Servicios' },
  { modulo: 'promociones', ruta: '/promociones', texto: 'Promociones' },
  { modulo: 'usuarios', ruta: '/usuarios', texto: 'Usuarios' },
  { modulo: 'branding', ruta: '/branding', texto: 'Branding' },
];

export const MODULOS_POR_ROL = {
  admin: ['dashboard', 'clientes', 'vehiculos', 'servicios', 'promociones', 'usuarios', 'branding', 'reportes'],
  operario: ['dashboard', 'clientes', 'vehiculos'],
  superadmin: ['superadmin'],
};

const INICIO_POR_ROL = { admin: '/', operario: '/', superadmin: '/superadmin' };

export const NOMBRE_ROL = { admin: 'Administrador', operario: 'Operario', superadmin: 'Superadministrador' };

/** Módulos del perfil: los que envía la API o, si no vienen, los de la copia local. */
export function modulosDe(perfil) {
  return perfil?.permisos?.modulos ?? MODULOS_POR_ROL[perfil?.rol] ?? [];
}

export const puedeVer = (perfil, modulo) => modulosDe(perfil).includes(modulo);

export const inicioDe = (perfil) => perfil?.permisos?.inicio ?? INICIO_POR_ROL[perfil?.rol] ?? '/';

/** Opciones del menú lateral que corresponden al rol (CA1, CA2). */
export const menuPara = (perfil) => MENU.filter((item) => puedeVer(perfil, item.modulo));
