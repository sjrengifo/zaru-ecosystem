// HU-02 CA3 — La sesión se revalida al volver a la pestaña, sin consultar en cada foco.
import test from 'node:test';
import assert from 'node:assert/strict';
import { INTERVALO_REVALIDACION_MS, debeRevalidar } from '../src/lib/revalidacion.js';

test('la primera revalidación siempre se hace', () => {
  assert.equal(debeRevalidar(1_000, 0), true);
});

test('no se repite la consulta antes del intervalo mínimo', () => {
  const ahora = 1_000_000;
  assert.equal(debeRevalidar(ahora + INTERVALO_REVALIDACION_MS - 1, ahora), false);
  assert.equal(debeRevalidar(ahora + INTERVALO_REVALIDACION_MS, ahora), true);
});

test('los valores inválidos no disparan consultas', () => {
  assert.equal(debeRevalidar(NaN, 0), false);
  assert.equal(debeRevalidar(1_000, NaN), false);
});
