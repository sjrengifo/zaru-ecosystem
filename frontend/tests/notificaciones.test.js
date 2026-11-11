// HU-34 — Reglas de presentación de la bitácora, sin React ni llamadas a la API.
import { describe, it, expect } from 'vitest';
import {
  ETIQUETAS_CANAL,
  ETIQUETAS_ESTADO,
  ETIQUETAS_TIPO,
  FILTROS_VACIOS,
  estadoNotificacion,
  fechaYHora,
  hayFiltros,
  horaBogota,
  textoEntrega,
} from '../src/lib/notificaciones.js';
import { formatoFechaHora } from '../src/lib/formato.js';

describe('HU-34 · etiquetas de la bitácora', () => {
  it('traduce canal, tipo y estado a textos claros', () => {
    expect(ETIQUETAS_CANAL).toMatchObject({ correo: 'Correo', sms: 'SMS', push: 'Push' });
    expect(ETIQUETAS_TIPO).toMatchObject({ operativa: 'Operativa', comercial: 'Comercial' });
    expect(ETIQUETAS_ESTADO).toMatchObject({ enviada: 'Enviada', entregada: 'Entregada', fallida: 'Fallida' });
  });

  it('da un color distinto a "enviada" y "entregada"', () => {
    expect(estadoNotificacion('enviada')).toEqual({ texto: 'Enviada', clase: 'estado-envio-enviada' });
    expect(estadoNotificacion('entregada')).toEqual({ texto: 'Entregada', clase: 'estado-envio-entregada' });
    expect(estadoNotificacion('fallida').clase).toBe('estado-envio-fallida');
    expect(estadoNotificacion(undefined).texto).toBe('—');
  });
});

describe('HU-34 · "aceptada" no es lo mismo que "entregada"', () => {
  it('distingue el acuse del proveedor de la entrega real', () => {
    expect(textoEntrega({ estado: 'enviada', aceptadaPorProveedor: true, entregada: false })).toContain('Aceptada por el proveedor');
    expect(textoEntrega({ estado: 'entregada', aceptadaPorProveedor: true, entregada: true })).toContain('confirmó la entrega');
    expect(textoEntrega({ estado: 'fallida' })).toContain('falló el envío');
    expect(textoEntrega({ estado: 'cancelada' })).toBe('Cancelada');
    expect(textoEntrega({ estado: 'pendiente' })).toBe('Aún no enviada');
  });
});

describe('HU-34 · fechas en hora de Bogotá', () => {
  it('muestra la fecha y la hora locales, no UTC', () => {
    expect(fechaYHora('2026-11-10T19:05:00Z')).toContain('2026');
    expect(fechaYHora('2026-11-10T19:05:00Z')).toContain('nov');
    expect(horaBogota('2026-11-10T19:05:00Z')).toContain('02'); // 19:05 UTC = 2:05 p. m. en Bogotá
    expect(horaBogota('2026-11-10T19:05:00Z')).not.toContain('19');
    expect(fechaYHora(null)).toBe('—');
    expect(fechaYHora('no-es-fecha')).toBe('—');
  });

  it('el formato compartido del panel también usa Bogotá', () => {
    expect(formatoFechaHora('2026-11-10T19:05:00Z')).toContain('10 de nov');
    expect(formatoFechaHora('2026-11-10T19:05:00Z')).toContain('02');
    expect(formatoFechaHora(null)).toBe('—');
  });
});

describe('HU-34 · filtros', () => {
  it('detecta si hay al menos un filtro activo', () => {
    expect(hayFiltros(FILTROS_VACIOS)).toBe(false);
    expect(hayFiltros({ ...FILTROS_VACIOS, placa: '  ' })).toBe(false);
    expect(hayFiltros({ ...FILTROS_VACIOS, canal: 'sms' })).toBe(true);
  });
});
