// HU-39 — Presentación del consumo mensual. Todos los porcentajes vienen calculados por la API;
// aquí solo se formatean y se decide el color de la barra.
export const FILTROS_CONSUMO = [
  { value: 'todos', label: 'Todos los estados' },
  { value: 'normal', label: 'Consumo normal' },
  { value: 'advertencia', label: 'Cercanos al límite (80 %)' },
  { value: 'agotado', label: 'Cupo agotado' },
];

export const ETIQUETAS_ESTADO_CONSUMO = {
  normal: 'Normal',
  advertencia: 'Cercano al límite',
  agotado: 'Cupo agotado',
};

export function pluralizar(cantidad, singular, plural) {
  return cantidad === 1 ? singular : plural;
}

/** Mes actual en America/Bogota (sin depender de la zona del navegador). */
export function mesBogota(fecha = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
  }).format(fecha);
}

/** Etiqueta legible para el selector: 2026-11 → noviembre de 2026. */
export function etiquetaMes(mes) {
  if (!/^\d{4}-\d{2}$/.test(String(mes ?? ''))) return String(mes ?? '');
  const [anio, numero] = mes.split('-').map(Number);
  const nombre = new Intl.DateTimeFormat('es-CO', { month: 'long' }).format(new Date(Date.UTC(anio, numero - 1, 1)));
  return `${nombre} de ${anio}`;
}

/** Mes anterior, para navegar el historial sin fechas inventadas. */
export function mesAnterior(mes) {
  const [anio, numero] = String(mes).split('-').map(Number);
  const fecha = new Date(Date.UTC(anio, numero - 2, 1));
  return `${fecha.getUTCFullYear()}-${String(fecha.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Mes siguiente, sin avanzar más allá del periodo actual. */
export function mesSiguiente(mes) {
  const [anio, numero] = String(mes).split('-').map(Number);
  const fecha = new Date(Date.UTC(anio, numero, 1));
  return `${fecha.getUTCFullYear()}-${String(fecha.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Opciones del selector: el actual y los 11 meses anteriores. */
export function opcionesMes(hoy = mesBogota()) {
  const meses = [hoy];
  let actual = hoy;
  for (let i = 0; i < 11; i += 1) {
    actual = mesAnterior(actual);
    meses.push(actual);
  }
  return meses;
}

/** `null` cuando no hay cupo configurado; el texto lo indica en la tabla. */
export function textoNumero(valor) {
  return valor === null || valor === undefined ? 'Sin límite' : new Intl.NumberFormat('es-CO').format(valor);
}

export function textoPorcentaje(valor) {
  return valor === null || valor === undefined ? '—' : `${new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 }).format(valor)} %`;
}

/** Ancho de la barra: 100 % como máximo, aunque el consumo supere el cupo. */
export function anchoBarra(canal) {
  if (!canal || canal.cupo === null || canal.cupo === undefined || canal.cupo <= 0) return 0;
  return Math.min(100, Math.max(0, (Number(canal.usados ?? 0) / Number(canal.cupo)) * 100));
}

export function claseBarra(canal) {
  if (!canal) return 'consumo-barra';
  if (canal.agotado) return 'consumo-barra agotada';
  if (canal.alerta80) return 'consumo-barra advertencia';
  return 'consumo-barra';
}

const sinTildes = (texto) => String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Filtros por texto, plan y estado calculados con datos reales del backend. */
export function filtrarConsumo(filas, { buscar = '', plan = 'todos', estado = 'todos' } = {}) {
  const texto = sinTildes(buscar.trim());
  return filas.filter((fila) =>
    (!texto || sinTildes(fila.nombre).includes(texto))
    && (plan === 'todos' || fila.plan === plan)
    && (estado === 'todos' || fila.estado === estado));
}

/** Convierte la fila del reporte en filas del historial para el modal de detalle. */
export function ultimosPeriodos(historial = [], limite = 6) {
  return [...historial]
    .sort((a, b) => String(b.mes).localeCompare(String(a.mes)))
    .slice(0, limite);
}
