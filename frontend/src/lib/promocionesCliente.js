// HU-26 — Reglas de presentación del explorador de promociones del cliente final, sin React.

const FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;
const DIA_MES = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const DIA_MES_ANIO = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** Hoy en Bogotá como AAAA-MM-DD. */
export const hoyBogota = (ahora = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(ahora);

/**
 * "Válida hasta el 30 de nov" a partir de la fecha_fin (AAAA-MM-DD, sin hora).
 * La fecha se arma en UTC y se formatea en UTC: con new Date('2026-11-30') el navegador la leería como
 * medianoche UTC y en Colombia (UTC-5) mostraría el 29. El año solo se muestra si no es el actual.
 */
export function validaHasta(fechaFin, hoy = hoyBogota()) {
  const partes = FECHA.exec(fechaFin ?? '');
  if (!partes) return '';
  const [, anio, mes, dia] = partes;
  const fecha = new Date(Date.UTC(Number(anio), Number(mes) - 1, Number(dia)));
  const formato = anio === hoy.slice(0, 4) ? DIA_MES : DIA_MES_ANIO;
  return fechaFin === hoy ? 'Válida solo hoy' : `Válida hasta el ${formato.format(fecha)}`;
}

/** "20 %" o "12,5 %" con la coma decimal de Colombia. */
export const textoDescuento = (pct) => `${new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 }).format(Number(pct))} %`;
