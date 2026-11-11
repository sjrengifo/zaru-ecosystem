// Formatos de presentación para Colombia.
const PESOS = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

export const formatoMoneda = (valor) => PESOS.format(valor);

export const iniciales = (nombre) =>
  nombre
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((parte) => parte[0])
    .join('')
    .toUpperCase();

export const formatoFecha = (fecha) => new Date(fecha).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });

// Fecha y hora en Bogotá, para bitácoras e historiales: "10 nov 2026, 14:05".
const FECHA_HORA_BOGOTA = new Intl.DateTimeFormat('es-CO', {
  timeZone: 'America/Bogota',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export const formatoFechaHora = (fecha) => {
  if (!fecha) return '—';
  const valor = new Date(fecha);
  return Number.isNaN(valor.getTime()) ? '—' : FECHA_HORA_BOGOTA.format(valor);
};

// Una fecha sin hora (AAAA-MM-DD) se muestra tal cual: con new Date() se leería en UTC y en Colombia saldría el día anterior.
export const formatoDia = (dia) => {
  const [anio, mes, d] = dia.split('-').map(Number);
  return new Date(anio, mes - 1, d).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
};
