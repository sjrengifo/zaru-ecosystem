// HU-09 — Pruebas de las reglas puras del tablero (sin navegador ni Supabase).
// Se ejecutan con `npm test` usando el runner integrado de Node.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COLUMNAS_TABLERO,
  agruparPorColumna,
  diaBogota,
  esDelDiaBogota,
  horaBogota,
  inicioDiaBogota,
  nombresServicios,
  vehiculosAtendidosHoy,
  vehiculosIngresadosHoy,
} from '../src/lib/dashboard.js';

const REFERENCIA = new Date('2026-11-03T15:30:00.000Z'); // 10:30 en Bogotá

test('el tablero tiene exactamente las cuatro columnas de HU-09', () => {
  assert.deepEqual(
    COLUMNAS_TABLERO.map((columna) => columna.titulo),
    ['Recibido', 'En lavado', 'Listo', 'Entregado'],
  );
});

test('secado se muestra dentro de En lavado sin perder su estado', () => {
  const grupos = agruparPorColumna([
    { id: '1', estado: 'secado', created_at: '2026-11-03T12:00:00Z' },
    { id: '2', estado: 'en_lavado', created_at: '2026-11-03T13:00:00Z' },
    { id: '3', estado: 'recibido', created_at: '2026-11-03T14:00:00Z' },
  ]);

  assert.deepEqual(grupos.en_lavado.map((orden) => orden.estado), ['secado', 'en_lavado']);
  assert.equal(grupos.recibido.length, 1);
  assert.equal(grupos.listo.length, 0);
  assert.equal(grupos.entregado.length, 0);
});

test('cada columna queda vacía cuando no hay órdenes', () => {
  const grupos = agruparPorColumna([]);
  for (const columna of COLUMNAS_TABLERO) assert.deepEqual(grupos[columna.id], []);
});

test('el día y la hora se calculan en la zona de Bogotá, no en UTC', () => {
  assert.equal(diaBogota(REFERENCIA), '2026-11-03');
  assert.equal(diaBogota(new Date('2026-11-03T04:30:00.000Z')), '2026-11-02');
  assert.equal(inicioDiaBogota(REFERENCIA), '2026-11-03T05:00:00.000Z');
  assert.equal(horaBogota(REFERENCIA), '10:30');
});

test('vehículos atendidos cuenta solo entregas de hoy y una vez por vehículo', () => {
  const ordenes = [
    { id: '1', vehiculo_id: 'v1', estado: 'entregado', entregada_at: '2026-11-03T14:00:00Z' },
    { id: '2', vehiculo_id: 'v1', estado: 'entregado', entregada_at: '2026-11-03T16:00:00Z' },
    { id: '3', vehiculo_id: 'v2', estado: 'entregado', entregada_at: '2026-11-04T05:30:00Z' },
    { id: '4', vehiculo_id: 'v3', estado: 'en_lavado', entregada_at: null },
  ];

  assert.equal(vehiculosAtendidosHoy(ordenes, REFERENCIA), 1);
  assert.equal(esDelDiaBogota('2026-11-04T05:30:00.000Z', REFERENCIA), false);
});

test('vehículos ingresados cuenta las órdenes creadas hoy en cualquier estado', () => {
  const ordenes = [
    // 00:00 y 23:59 del 3 de noviembre en Bogotá: ambos cuentan.
    { id: '1', vehiculo_id: 'v1', estado: 'recibido', created_at: '2026-11-03T05:00:00Z' },
    { id: '2', vehiculo_id: 'v2', estado: 'entregado', created_at: '2026-11-04T04:59:00Z' },
    // Ya es 4 de noviembre en Bogotá.
    { id: '3', vehiculo_id: 'v3', estado: 'recibido', created_at: '2026-11-04T05:00:00Z' },
    // Todavía era 2 de noviembre en Bogotá.
    { id: '4', vehiculo_id: 'v4', estado: 'en_lavado', created_at: '2026-11-03T04:59:00Z' },
    // Mismo vehículo que vuelve: no se cuenta dos veces.
    { id: '5', vehiculo_id: 'v1', estado: 'listo', created_at: '2026-11-03T18:00:00Z' },
    { id: '6', vehiculo_id: 'v5', estado: 'recibido', created_at: null },
  ];

  assert.equal(vehiculosIngresadosHoy(ordenes, REFERENCIA), 2);
  assert.equal(vehiculosIngresadosHoy([], REFERENCIA), 0);
});

test('los nombres de servicio se muestran juntos y hay texto de respaldo', () => {
  assert.equal(
    nombresServicios({
      orden_servicios: [
        { servicios: { nombre: 'Lavado básico' } },
        { servicios: { nombre: 'Lavado de motor' } },
      ],
    }),
    'Lavado básico, Lavado de motor',
  );
  assert.equal(nombresServicios({ orden_servicios: [] }), 'Sin servicios');
  assert.equal(nombresServicios(null), 'Sin servicios');
});
