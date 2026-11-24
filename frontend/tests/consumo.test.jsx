// HU-39 — Utilidades del panel de consumo y service de cupos.
import { describe, it, expect, vi } from 'vitest';
import {
  FILTROS_CONSUMO,
  anchoBarra,
  claseBarra,
  etiquetaMes,
  filtrarConsumo,
  mesAnterior,
  mesBogota,
  mesSiguiente,
  opcionesMes,
  textoNumero,
  textoPorcentaje,
  ultimosPeriodos,
} from '../src/lib/consumo.js';

const CANAL = (usados, cupo, alerta80 = false, agotado = false) => ({ usados, cupo, porcentaje: usados / cupo * 100, alerta80, agotado });

describe('HU-39 · cálculos de presentación del consumo', () => {
  it('el periodo por defecto es el mes actual en America/Bogota, no el del navegador', () => {
    const fecha = new Date('2026-11-01T02:30:00Z'); // 21:30 del día anterior en Bogotá
    expect(mesBogota(fecha)).toBe('2026-10');
    expect(mesAnterior('2026-01')).toBe('2025-12');
    expect(mesSiguiente('2026-12')).toBe('2027-01');
    expect(opcionesMes('2026-11')).toHaveLength(12);
    expect(opcionesMes('2026-11')[1]).toBe('2026-10');
  });

  it('el porcentaje y la barra usan los valores del backend y nunca superan el 100 % visual', () => {
    expect(anchoBarra(CANAL(160, 200))).toBe(80);
    expect(anchoBarra(CANAL(250, 200))).toBe(100);
    expect(anchoBarra(CANAL(10, null))).toBe(0);
    expect(claseBarra(CANAL(160, 200, true))).toContain('advertencia');
    expect(claseBarra(CANAL(200, 200, true, true))).toContain('agotada');
    expect(textoPorcentaje(83.33)).toBe('83,33 %');
    expect(textoPorcentaje(null)).toBe('—');
    expect(textoNumero(null)).toBe('Sin límite');
    expect(textoNumero(2000)).toBe('2.000');
    expect(etiquetaMes('2026-11')).toMatch(/2026/);
  });

  it('filtra por nombre sin tildes, plan y estado', () => {
    const filas = [
      { nombre: 'Lavadero Norte', plan: 'basico', estado: 'normal' },
      { nombre: 'Autoespaña Sur', plan: 'empresarial', estado: 'agotado' },
      { nombre: 'Brillo Total', plan: 'intermedio', estado: 'advertencia' },
    ];
    expect(filtrarConsumo(filas, { buscar: 'norte' })).toHaveLength(1);
    expect(filtrarConsumo(filas, { buscar: 'espana' })[0].nombre).toBe('Autoespaña Sur');
    expect(filtrarConsumo(filas, { plan: 'empresarial' })).toHaveLength(1);
    expect(filtrarConsumo(filas, { estado: 'advertencia' })[0].nombre).toBe('Brillo Total');
    expect(FILTROS_CONSUMO.map((f) => f.value)).toEqual(['todos', 'normal', 'advertencia', 'agotado']);
  });

  it('ordena el historial de más reciente a más antiguo', () => {
    const historial = [
      { mes: '2026-09', sms: 1 },
      { mes: '2026-11', sms: 3 },
      { mes: '2026-10', sms: 2 },
    ];
    expect(ultimosPeriodos(historial).map((f) => f.mes)).toEqual(['2026-11', '2026-10', '2026-09']);
  });
});
