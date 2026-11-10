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
 * Las cuatro columnas de HU-09 CA1: Recibido, En lavado, Listo y Entregado.
 * `secado` no tiene columna propia: se agrupa dentro de "En lavado" y la
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
 * HU-11 — Umbral de la alerta: más de 30 segundos en el mismo estado.
 * La alerta se repite cada 30 s mientras el estado no se actualice y deja de
 * mostrarse en `entregado`.
 */
export const UMBRAL_ALERTA_SEGUNDOS = 30;

/**
 * HU-11 — ¿La orden lleva más de 30 segundos en su estado actual?
 *
 * El tiempo se mide desde `estado_desde`, que la función SQL reinicia en cada
 * cambio de estado. Para el estado inicial `recibido`, si por algún motivo aún
 * no hay `estado_desde`, se usa `created_at`: el conteo arranca al ingresar el
 * vehículo. Una orden entregada ya terminó su seguimiento y no alerta.
 * Si falta la fecha o la referencia, tampoco alerta.
 */
export function calcularDemora(orden, referencia = new Date()) {
  const inicioEstado =
    orden?.estado_desde || (orden?.estado === 'recibido' ? orden?.created_at : null);
  const desde = new Date(inicioEstado ?? NaN).getTime();
  const ahora = new Date(referencia).getTime();

  const sinDatos =
    Number.isNaN(desde) || Number.isNaN(ahora) || orden?.estado === 'entregado';

  if (sinDatos) {
    return { demorada: false, transcurridoMin: 0, transcurridoSeg: 0 };
  }

  const transcurridoMs = Math.max(0, ahora - desde);
  return {
    // La alerta aparece solo cuando se superan los 30 s exactos.
    demorada: transcurridoMs > UMBRAL_ALERTA_SEGUNDOS * 1000,
    transcurridoMin: Math.floor(transcurridoMs / 60_000),
    transcurridoSeg: Math.floor(transcurridoMs / 1000),
  };
}

/** Texto corto del tiempo transcurrido: segundos, minutos, horas o días. */
export function tiempoEnEstadoLegible(segundos) {
  const total = Number.isFinite(segundos) && segundos > 0 ? Math.floor(segundos) : 0;
  if (total < 60) return `${total} s`;

  const minutos = Math.floor(total / 60);
  if (minutos < 60) return `${minutos} min`;

  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `${horas} h`;

  return `${Math.floor(horas / 24)} d`;
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
