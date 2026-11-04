// HU-16 — Reglas de la pantalla de reportes, sin React ni llamadas a la API.
// Las fechas se manejan como días AAAA-MM-DD para no cruzar de día por la zona
// horaria: el backend interpreta el rango completo en hora de Bogotá.

import { diaBogota } from './dashboard.js';

export const MENSAJE_SIN_DATOS = 'No hay datos disponibles para el rango de fechas seleccionado';

const FORMATO_DIA = /^\d{4}-\d{2}-\d{2}$/;

function esDiaReal(dia) {
  if (!FORMATO_DIA.test(dia)) return false;
  const [anio, mes, numero] = dia.split('-').map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1, numero));
  return fecha.getUTCFullYear() === anio && fecha.getUTCMonth() === mes - 1 && fecha.getUTCDate() === numero;
}

/** Día de hoy en Bogotá (AAAA-MM-DD). */
export const hoyBogota = () => diaBogota(new Date());

/** Resta días a un AAAA-MM-DD usando UTC; Colombia no tiene horario de verano. */
export function restarDias(dia, dias) {
  const [anio, mes, numero] = dia.split('-').map(Number);
  return new Date(Date.UTC(anio, mes - 1, numero - dias)).toISOString().slice(0, 10);
}

/** Primer día del mes de una fecha AAAA-MM-DD. */
export const primerDiaMes = (dia = hoyBogota()) => `${dia.slice(0, 7)}-01`;

/** Rango con el que abre la pantalla: el mes en curso hasta hoy. */
export function rangoPredeterminado(referencia = new Date()) {
  const hasta = diaBogota(referencia);
  return { desde: primerDiaMes(hasta), hasta };
}

/**
 * Valida el filtro antes de consultar. Devuelve el mensaje a mostrar o '' si
 * el rango es válido. La fecha inicial no puede ser posterior a la final.
 */
export function validarRango(desde, hasta) {
  if (!desde || !hasta) return 'Selecciona la fecha de inicio y la fecha de fin';
  if (!esDiaReal(desde) || !esDiaReal(hasta)) return 'Selecciona fechas válidas';
  if (desde > hasta) return 'La fecha de inicio no puede ser posterior a la fecha de fin';
  return '';
}

/** Mayor valor de una lista de objetos, para escalar las barras. */
export function maximoDe(lista = [], campo) {
  return lista.reduce((maximo, item) => Math.max(maximo, Number(item?.[campo]) || 0), 0);
}

/** Ancho porcentual de una barra, limitado a 0–100 %. */
export function anchoBarra(valor, maximo) {
  if (!maximo || maximo <= 0) return '0%';
  const porcentaje = Math.max(0, Math.min(100, (Number(valor) / maximo) * 100));
  return `${porcentaje}%`;
}

/** Nivel 0–5 del mapa de calor, relativo al valor máximo del reporte. */
export function nivelCalor(valor, maximo) {
  if (!maximo || maximo <= 0 || !valor) return 0;
  return Math.max(1, Math.min(5, Math.ceil((Number(valor) / maximo) * 5)));
}

/** Totales de una fila (día) o de una columna (franja) de la matriz. */
export const totalFila = (fila = []) => fila.reduce((total, valor) => total + (Number(valor) || 0), 0);

export const totalColumna = (matriz = [], indice) =>
  matriz.reduce((total, fila) => total + (Number(fila?.[indice]) || 0), 0);
