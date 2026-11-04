// HU-59 — Qué módulos del panel puede usar cada rol. Es la única fuente de verdad:
// - la API la aplica en las rutas con requiereModulo (403 + auditoría si no corresponde),
// - GET /me la envía al panel, que arma el menú y bloquea las páginas con la misma lista.
//
// CA1: el operario solo ve su trabajo diario: órdenes y estados de los vehículos (dashboard) y lo
//      que necesita para registrar el ingreso (clientes y vehículos). No ve configuración
//      (servicios, usuarios, branding), promociones ni reportes.
// CA2: el administrador ve todos los módulos; los datos siguen filtrados por su establecimiento (HU-41).

export const MODULOS = ['dashboard', 'clientes', 'vehiculos', 'servicios', 'promociones', 'usuarios', 'branding', 'reportes', 'superadmin'];

export const MODULOS_POR_ROL = Object.freeze({
  admin: Object.freeze(['dashboard', 'clientes', 'vehiculos', 'servicios', 'promociones', 'usuarios', 'branding', 'reportes']),
  operario: Object.freeze(['dashboard', 'clientes', 'vehiculos']),
  superadmin: Object.freeze(['superadmin']),
});

/** Página a la que vuelve el usuario si intenta abrir una sección ajena (CA3). */
export const INICIO_POR_ROL = Object.freeze({ admin: '/', operario: '/', superadmin: '/superadmin' });

export const puedeUsar = (rol, modulo) => Boolean(MODULOS_POR_ROL[rol]?.includes(modulo));

/** Roles que pueden usar un módulo, para requiereRol. */
export const rolesConModulo = (modulo) => Object.keys(MODULOS_POR_ROL).filter((rol) => puedeUsar(rol, modulo));

/** Lo que recibe el panel en GET /me. */
export const permisosDe = (rol) => ({ modulos: [...(MODULOS_POR_ROL[rol] ?? [])], inicio: INICIO_POR_ROL[rol] ?? '/' });
