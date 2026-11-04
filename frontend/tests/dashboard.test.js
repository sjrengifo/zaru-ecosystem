// HU-09 — Pruebas de las reglas puras del tablero (sin navegador ni Supabase).
// Se ejecutan con `npm test` usando el runner integrado de Node.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COLUMNAS_TABLERO,
  agruparPorColumna,
  calcularDemora,
  diaBogota,
  esDelDiaBogota,
  horaBogota,
  inicioDiaBogota,
  nombresServicios,
  tiempoEnEstadoLegible,
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

// HU-11 — Alertas de vehículos sin actualizar.
// Regla de producto: más de 30 segundos en el mismo estado.
// Referencia fija: 3 de noviembre de 2026, 15:30:31 UTC.
const REFERENCIA_DEMORA = new Date('2026-11-03T15:30:31.000Z');
const ordenEnEstado = (estadoDesde, extra = {}) => ({
  estado: 'en_lavado',
  estado_desde: estadoDesde,
  ...extra,
});

test('HU-11: no alerta a los 30 s exactos y sí a los 31 s', () => {
  const aLos30 = calcularDemora(
    ordenEnEstado('2026-11-03T15:30:01.000Z'),
    REFERENCIA_DEMORA,
  );
  assert.equal(aLos30.transcurridoSeg, 30);
  assert.equal(aLos30.demorada, false);

  const aLos31 = calcularDemora(
    ordenEnEstado('2026-11-03T15:30:00.000Z'),
    REFERENCIA_DEMORA,
  );
  assert.equal(aLos31.transcurridoSeg, 31);
  assert.equal(aLos31.demorada, true);
});

test('HU-11: en Recibido el conteo arranca al crear la orden si falta estado_desde', () => {
  const recibida = {
    estado: 'recibido',
    created_at: '2026-11-03T15:30:00.000Z',
  };
  const demora = calcularDemora(recibida, REFERENCIA_DEMORA);

  assert.equal(demora.demorada, true);
  assert.equal(demora.transcurridoSeg, 31);
});

test('HU-11: en estados posteriores no se usa created_at como respaldo', () => {
  const sinFechaDeEstado = {
    estado: 'en_lavado',
    created_at: '2026-11-03T15:00:00.000Z',
  };

  assert.equal(calcularDemora(sinFechaDeEstado, REFERENCIA_DEMORA).demorada, false);
});

test('HU-11: al actualizar el estado se reinicia el conteo y la alerta desaparece', () => {
  const antes = ordenEnEstado('2026-11-03T15:29:00.000Z'); // 91 s
  assert.equal(calcularDemora(antes, REFERENCIA_DEMORA).demorada, true);

  // La función SQL guarda estado_desde = now() en el cambio correcto.
  const actualizada = {
    ...antes,
    estado: 'listo',
    estado_desde: '2026-11-03T15:30:20.000Z', // 11 s
  };
  const demora = calcularDemora(actualizada, REFERENCIA_DEMORA);

  assert.equal(demora.demorada, false);
  assert.equal(demora.transcurridoSeg, 11);
});

test('HU-11: el nuevo estado empieza a contar su propio tiempo y vuelve a alertar', () => {
  const recienCambiada = ordenEnEstado('2026-11-03T15:30:20.000Z', { estado: 'listo' });

  assert.equal(calcularDemora(recienCambiada, REFERENCIA_DEMORA).demorada, false);
  assert.equal(
    calcularDemora(recienCambiada, new Date('2026-11-03T15:30:50.000Z')).demorada,
    false,
  );
  assert.equal(
    calcularDemora(recienCambiada, new Date('2026-11-03T15:30:51.000Z')).demorada,
    true,
  );
});

test('HU-11: alerta aunque la orden no tenga servicios registrados', () => {
  const sinServicios = {
    estado: 'recibido',
    created_at: '2026-11-03T15:30:00.000Z',
  };

  assert.equal(calcularDemora(sinServicios, REFERENCIA_DEMORA).demorada, true);
});

test('HU-11: sin fecha de estado no genera alertas', () => {
  for (const orden of [ordenEnEstado(null), ordenEnEstado('fecha-inválida')]) {
    assert.equal(calcularDemora(orden, REFERENCIA_DEMORA).demorada, false);
  }
});

test('HU-11: una orden entregada ya no muestra alerta de demora', () => {
  const entregada = ordenEnEstado('2026-10-01T10:00:00.000Z', { estado: 'entregado' });

  assert.equal(calcularDemora(entregada, REFERENCIA_DEMORA).demorada, false);
  assert.equal(calcularDemora(entregada, REFERENCIA_DEMORA).transcurridoSeg, 0);
});

test('HU-11: el tiempo en estado se muestra en unidades legibles', () => {
  assert.equal(tiempoEnEstadoLegible(31), '31 s');
  assert.equal(tiempoEnEstadoLegible(90), '1 min');
  assert.equal(tiempoEnEstadoLegible(3_600), '1 h');
  assert.equal(tiempoEnEstadoLegible(90_000), '1 d');
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
