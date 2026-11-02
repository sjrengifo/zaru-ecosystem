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

// Una fecha sin hora (AAAA-MM-DD) se muestra tal cual: con new Date() se leería en UTC y en Colombia saldría el día anterior.
export const formatoDia = (dia) => {
  const [anio, mes, d] = dia.split('-').map(Number);
  return new Date(anio, mes - 1, d).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
};
