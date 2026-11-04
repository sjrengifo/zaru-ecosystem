// HU-16 — Pruebas de las reglas puras de la pantalla de reportes.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MENSAJE_SIN_DATOS,
  anchoBarra,
  nivelCalor,
  primerDiaMes,
  rangoPredeterminado,
  restarDias,
  totalColumna,
  totalFila,
  validarRango,
} from '../src/lib/reportes.js';

test('CA3: el aviso de un rango sin datos tiene el texto acordado', () => {
  assert.equal(MENSAJE_SIN_DATOS, 'No hay datos disponibles para el rango de fechas seleccionado');
});

test('el rango inicial es el mes en curso en Bogotá', () => {
  assert.deepEqual(rangoPredeterminado(new Date('2026-11-03T15:00:00.000Z')), {
    desde: '2026-11-01',
    hasta: '2026-11-03',
  });
  assert.equal(primerDiaMes('2026-02-17'), '2026-02-01');
});

test('los rangos rápidos restan días sin cruzar mal el cambio de mes', () => {
  assert.equal(restarDias('2026-11-03', 6), '2026-10-28');
  assert.equal(restarDias('2026-03-01', 1), '2026-02-28');
});

test('valida que la fecha inicial no sea posterior a la final', () => {
  assert.equal(validarRango('2026-11-01', '2026-11-03'), '');
  assert.equal(validarRango('2026-11-03', '2026-11-03'), '');
  assert.equal(validarRango('2026-11-04', '2026-11-03'), 'La fecha de inicio no puede ser posterior a la fecha de fin');
  assert.equal(validarRango('', '2026-11-03'), 'Selecciona la fecha de inicio y la fecha de fin');
  assert.equal(validarRango('2026-02-30', '2026-11-03'), 'Selecciona fechas válidas');
});

test('las barras se escalan al máximo y quedan dentro de 0–100 %', () => {
  assert.equal(anchoBarra(5, 10), '50%');
  assert.equal(anchoBarra(20, 10), '100%');
  assert.equal(anchoBarra(0, 10), '0%');
  assert.equal(anchoBarra(5, 0), '0%');
});

test('el mapa de calor usa seis niveles relativos al máximo', () => {
  assert.equal(nivelCalor(0, 10), 0);
  assert.equal(nivelCalor(1, 10), 1);
  assert.equal(nivelCalor(6, 10), 3);
  assert.equal(nivelCalor(10, 10), 5);
  assert.equal(nivelCalor(20, 10), 5);
  assert.equal(nivelCalor(3, 0), 0);
});

test('suma los totales por fila y por columna de la matriz', () => {
  const matriz = [
    [1, 2, 0],
    [0, 3, 1],
  ];
  assert.equal(totalFila(matriz[0]), 3);
  assert.equal(totalColumna(matriz, 1), 5);
  assert.equal(totalColumna([], 0), 0);
});
