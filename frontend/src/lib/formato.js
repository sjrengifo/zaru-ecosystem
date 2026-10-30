// Formatos de presentación para Colombia.
const PESOS = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

export const formatoMoneda = (valor) => PESOS.format(valor);

export const formatoFecha = (fecha) => new Date(fecha).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
