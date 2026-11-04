// HU-09 — Reglas del tablero operativo, sin React ni Supabase.
// Aquí viven el agrupamiento por columna, los textos de estado y los cálculos
// del día (siempre con la zona horaria de Bogotá). Así la página solo pinta.

const ZONA_BOGOTA = 'America/Bogota';
// Colombia no aplica horario de verano: el día siempre empieza a las 00:00 -05:00.
const DESFASE_BOGOTA = '-05:00';

const FORMATO_DIA = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA_BOGOTA,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const FORMATO_HORA = new Intl.DateTimeFormat('es-CO', {
  timeZone: ZONA_BOGOTA,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/** Estados reales de la orden (enum public.estado_orden). */
export const ESTADOS_ORDEN = {
  recibido: 'Recibido',
  en_lavado: 'En lavado',
  secado: 'Secado',
  listo: 'Listo',
  entregado: 'Entregado',
};

/** Flujo operativo de HU-10; `secado` es opcional, por eso en_lavado puede pasar a listo. */
export const SIGUIENTE_ESTADO = {
  recibido: 'en_lavado',
  en_lavado: 'secado',
  secado: 'listo',
  listo: 'entregado',
};

/**
 * Las cuatro columnas de HU-09 CA1.
 * `secado` no tiene columna propia: se muestra dentro de "En lavado" y la
 * tarjeta conserva su etiqueta "Secado" para no ocultar el estado real.
 */
export const COLUMNAS_TABLERO = [
  { id: 'recibido', titulo: 'Recibido', estados: ['recibido'] },
  { id: 'en_lavado', titulo: 'En lavado', estados: ['en_lavado', 'secado'] },
  { id: 'listo', titulo: 'Listo', estados: ['listo'] },
  { id: 'entregado', titulo: 'Entregado', estados: ['entregado'] },
];

const COLUMNA_POR_ESTADO = new Map(
  COLUMNAS_TABLERO.flatMap((columna) => columna.estados.map((estado) => [estado, columna.id])),
);

/** Día calendario (AAAA-MM-DD) de una fecha en Bogotá. */
export function diaBogota(fecha = new Date()) {
  const partes = FORMATO_DIA.formatToParts(new Date(fecha));
  const valor = (tipo) => partes.find((parte) => parte.type === tipo)?.value;
  return `${valor('year')}-${valor('month')}-${valor('day')}`;
}

/** Instante UTC en que empezó el día de hoy en Bogotá (para filtrar en Supabase). */
export function inicioDiaBogota(fecha = new Date()) {
  return new Date(`${diaBogota(fecha)}T00:00:00${DESFASE_BOGOTA}`).toISOString();
}

/** ¿La fecha cae en el mismo día calendario de Bogotá que la referencia? */
export function esDelDiaBogota(fecha, referencia = new Date()) {
  if (!fecha) return false;
  const valor = new Date(fecha);
  if (Number.isNaN(valor.getTime())) return false;
  return diaBogota(valor) === diaBogota(referencia);
}

/** Hora local de Bogotá en formato HH:mm (24 h). */
export function horaBogota(fecha) {
  if (!fecha) return '';
  return FORMATO_HORA.format(new Date(fecha));
}

/** Nombres de los servicios contratados, en el orden en que se guardaron. */
export function nombresServicios(orden) {
  const nombres = (orden?.orden_servicios ?? [])
    .map((item) => item?.servicios?.nombre)
    .filter(Boolean);
  return nombres.length > 0 ? nombres.join(', ') : 'Sin servicios';
}

/**
 * Agrupa las órdenes en las cuatro columnas y las ordena por hora de ingreso
 * (la más antigua primero, que es la que conviene atender antes).
 */
export function agruparPorColumna(ordenes = []) {
  const grupos = Object.fromEntries(COLUMNAS_TABLERO.map((columna) => [columna.id, []]));

  for (const orden of ordenes) {
    const columna = COLUMNA_POR_ESTADO.get(orden?.estado);
    if (columna) grupos[columna].push(orden);
  }

  const ingreso = (orden) => new Date(orden.created_at).getTime() || 0;
  for (const columna of COLUMNAS_TABLERO) grupos[columna.id].sort((a, b) => ingreso(a) - ingreso(b));

  return grupos;
}

/**
 * Vehículos ingresados hoy (CA3): órdenes creadas en el día de Bogotá.
 * `created_at` es la hora de ingreso que ya muestra cada tarjeta, así que el
 * indicador mide la entrada de vehículos, no el dinero recaudado.
 *
 * El tablero trae todas las órdenes activas y las entregadas hoy, de modo que
 * cualquier orden creada hoy está en la lista (sigue activa o ya se entregó).
 * Se cuentan vehículos distintos para no duplicar si un mismo carro vuelve.
 */
export function vehiculosIngresadosHoy(ordenes = [], referencia = new Date()) {
  const vistos = new Set();
  for (const orden of ordenes) {
    if (!esDelDiaBogota(orden?.created_at, referencia)) continue;
    vistos.add(orden.vehiculo_id ?? orden.id);
  }
  return vistos.size;
}

/**
 * Vehículos atendidos hoy: órdenes entregadas cuya `entregada_at` (fecha real
 * de entrega) cae en el día de Bogotá. Se cuenta cada vehículo una sola vez.
 */
export function vehiculosAtendidosHoy(ordenes = [], referencia = new Date()) {
  const vistos = new Set();
  for (const orden of ordenes) {
    if (orden?.estado !== 'entregado' || !orden.entregada_at) continue;
    if (!esDelDiaBogota(orden.entregada_at, referencia)) continue;
    vistos.add(orden.vehiculo_id ?? orden.id);
  }
  return vistos.size;
}
