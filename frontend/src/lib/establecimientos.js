// HU-57 — Datos de presentación y reglas del panel de superadministración.

export const PLANES = [
  { value: 'basico', label: 'Básico', descripcion: 'Para empezar: una sede con lo esencial.' },
  { value: 'intermedio', label: 'Intermedio', descripcion: 'Para sedes con más volumen diario.' },
  { value: 'empresarial', label: 'Empresarial', descripcion: 'Para cadenas con varias sedes.' },
];

export const ESTADOS = {
  prueba: 'En prueba',
  activo: 'Activo',
  pendiente_activacion: 'Pendiente de activación',
  suspendido: 'Suspendido',
};

/** Filtros del listado, en el orden de las tarjetas de resumen. */
export const FILTROS = [
  { id: 'todos', texto: 'Todos' },
  { id: 'prueba', texto: 'En prueba' },
  { id: 'activo', texto: 'Activos' },
  { id: 'pendiente_activacion', texto: 'Pendientes' },
  { id: 'suspendido', texto: 'Suspendidos' },
];

export const DIAS_MINIMOS = 14;
export const DIAS_MAXIMOS = 30;
export const DIAS_AVISO_VENCIMIENTO = 3;

/** Acciones disponibles según el estado (mismas reglas que la API). */
export function accionesPara(establecimiento) {
  const { estado, administrador } = establecimiento;
  return {
    activar: ['prueba', 'pendiente_activacion', 'suspendido'].includes(estado),
    suspender: ['prueba', 'activo', 'pendiente_activacion'].includes(estado),
    reenviar: estado !== 'suspendido' && administrador?.invitacionAceptada === false,
  };
}

/** Cantidad por estado para las tarjetas de resumen. */
export function contarPorEstado(lista) {
  const conteo = { todos: lista.length, prueba: 0, activo: 0, pendiente_activacion: 0, suspendido: 0 };
  for (const e of lista) if (e.estado in conteo) conteo[e.estado] += 1;
  return conteo;
}

const sinTildes = (texto) => String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Filtra por estado y por texto (nombre o correo del administrador), sin distinguir tildes. */
export function filtrarEstablecimientos(lista, { estado = 'todos', buscar = '' } = {}) {
  const texto = sinTildes(buscar.trim());
  return lista.filter((e) => (estado === 'todos' || e.estado === estado)
    && (!texto || sinTildes(e.nombre).includes(texto) || sinTildes(e.administrador?.correo).includes(texto)));
}

/** Validación del formulario antes de enviarlo (la API valida de nuevo). */
export function validarRegistro({ nombre, correoAdministrador, diasPrueba }) {
  const errores = {};
  if (nombre.trim().length < 2) errores.nombre = 'Escribe el nombre del establecimiento (mínimo 2 caracteres).';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correoAdministrador.trim())) errores.correoAdministrador = 'Escribe un correo válido.';
  const dias = Number(diasPrueba);
  if (!Number.isInteger(dias) || dias < DIAS_MINIMOS || dias > DIAS_MAXIMOS) {
    errores.diasPrueba = `El periodo de prueba debe ser de ${DIAS_MINIMOS} a ${DIAS_MAXIMOS} días.`;
  }
  return errores;
}

/** Fecha en que terminaría una prueba que empieza hoy. */
export function finDePrueba(dias, hoy = new Date()) {
  const fin = new Date(hoy);
  fin.setDate(fin.getDate() + Number(dias));
  return fin;
}

export const formatoFechaCorta = (valor) =>
  valor ? new Date(valor).toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
