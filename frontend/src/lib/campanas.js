// HU-35 — Reglas de presentación de las campañas de promociones (ZARU-24).
// La API es la que decide: el navegador solo repite el cálculo del horario para avisar antes de
// confirmar y traduce los motivos de exclusión a texto.

export const ZONA = 'America/Bogota';
export const HORA_INICIO = 7;
export const HORA_FIN = 20;
export const DIAS_SIN_VISITA = [30, 60, 90];

export const ESTADOS_CAMPANA = {
  programada: 'Programada',
  enviando: 'Enviando',
  enviada: 'Enviada',
  cancelada: 'Cancelada',
};

export const ETIQUETAS_EXCLUSION = {
  sinAutorizacion: 'No autorizó promociones',
  limiteSemanal: 'Ya recibió 2 promociones esta semana',
  sinCanal: 'Sin correo registrado',
  duplicados: 'Ya estaba en la cola',
};

const DESFASE_BOGOTA_MS = 5 * 60 * 60 * 1000;

/** Texto corto del segmento para el resumen y el historial. */
export function textoDias(dias) {
  return `Sin visita hace ${dias} días o más`;
}

/** Conteo de exclusiones con etiqueta, omitiendo los motivos en cero. */
export function resumenExclusiones(exclusiones = {}) {
  return Object.entries(exclusiones)
    .filter(([, cantidad]) => Number(cantidad) > 0)
    .map(([clave, cantidad]) => ({
      clave,
      etiqueta: ETIQUETAS_EXCLUSION[clave] ?? clave,
      cantidad: Number(cantidad),
    }));
}

/**
 * RF-F7-09 / CA4: si la hora de Bogotá cae entre las 8:00 p. m. y las 7:00 a. m., se mueve a las
 * 7:00 a. m. del día siguiente. Una hora pasada se envía de inmediato. Es la misma regla del
 * backend (`backend/src/shared/campanas.js`); aquí solo sirve para avisar en pantalla.
 * @returns {{ programadaPara: Date, ajustada: boolean } | null} null si la fecha no es válida.
 */
export function ajustarHorarioBogota(fecha, ahora = new Date()) {
  if (!(fecha instanceof Date) || Number.isNaN(fecha.getTime())) return null;
  const solicitada = new Date(fecha.getTime());
  const base = solicitada.getTime() < ahora.getTime() ? new Date(ahora.getTime()) : solicitada;
  const local = new Date(base.getTime() - DESFASE_BOGOTA_MS);
  const hora = local.getUTCHours();

  if (hora >= HORA_INICIO && hora < HORA_FIN) {
    return { programadaPara: base, ajustada: base.getTime() !== solicitada.getTime() };
  }

  const siguienteDia = hora >= HORA_FIN;
  return {
    programadaPara: new Date(
      Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + (siguienteDia ? 1 : 0), HORA_INICIO + 5, 0, 0),
    ),
    ajustada: true,
  };
}

/**
 * Convierte el valor de un <input type="datetime-local"> (AAAA-MM-DDTHH:mm) a una fecha entendida
 * en hora de Bogotá. Sin el desfase, el navegador la leería en la zona del computador.
 */
export function aFechaBogota(valor) {
  if (!valor) return null;
  const texto = valor.length === 16 ? `${valor}:00` : valor;
  const fecha = new Date(`${texto}-05:00`);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

/** Valor inicial del campo de programación: dentro de una hora, en hora de Bogotá. */
export function valorProgramacionPorDefecto(ahora = new Date()) {
  return aValorDatetimeLocal(new Date(ahora.getTime() + 60 * 60 * 1000));
}

/** Fecha a AAAA-MM-DDTHH:mm en hora de Bogotá, el formato que acepta datetime-local. */
export function aValorDatetimeLocal(fecha) {
  if (!(fecha instanceof Date) || Number.isNaN(fecha.getTime())) return '';
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(fecha);
  const valor = Object.fromEntries(partes.map((p) => [p.type, p.value]));
  return `${valor.year}-${valor.month}-${valor.day}T${valor.hour}:${valor.minute}`;
}

/** Clave única para el encabezado Idempotency-Key; si el navegador no la ofrece, se arma una. */
export function nuevaClaveIdempotencia() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `campana-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
