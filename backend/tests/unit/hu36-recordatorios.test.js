// HU-36 — Recordatorio del próximo lavado: cálculo, programación, baja por token y worker.
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { crearTenantFalso } from '../helpers/tenantFalso.js';
import { descifrar } from '../../src/shared/cifrado.js';
import {
  calcularPromedioDias,
  cancelarPorNuevoServicio,
  fechaProgramada,
  programarRecordatorio,
} from '../../src/shared/recordatorios.js';
import { crearTokenRecordatorio, enlaceRecordatorio, leerTokenRecordatorio } from '../../src/shared/tokenRecordatorio.js';
import { enviarUnIntento, EVENTOS } from '../../src/shared/notificaciones.js';

beforeAll(() => {
  process.env.ZARU_CLAVE_CIFRADO = Buffer.alloc(32, 9).toString('base64');
});

const ESTABLECIMIENTO_ID = 'eeeeeeee-0000-4000-8000-000000000001';
const CLIENTE_ID = '11111111-1111-4111-8111-111111111111';
const VEHICULO_ID = '22222222-2222-4222-8222-222222222222';
const RECORDATORIO_ID = '33333333-3333-4333-8333-333333333333';
const NOTIFICACION_ID = '44444444-4444-4444-8444-444444444444';

const AHORA = new Date('2026-11-11T15:00:00Z');

function tenantProgramable({ ordenes, activos = true, autorizado = true, correo = 'ana@correo.com' } = {}) {
  return crearTenantFalso({
    vehiculos: [{ data: { id: VEHICULO_ID, placa: 'XYZ987', cliente_id: CLIENTE_ID, recordatorios_activos: activos }, error: null }],
    clientes: [{ data: { id: CLIENTE_ID, nombre: 'Ana Gómez', correo }, error: null }],
    ordenes: [{ data: ordenes, error: null }],
    autorizaciones_vigentes: [{ data: autorizado ? [{ tipo: 'comerciales', otorgado: true }] : [], error: null }],
    recordatorios: [{ data: [], error: null }],
  });
}

describe('HU-36 cálculo', () => {
  it('promedia los intervalos entre visitas y exige al menos tres servicios', () => {
    expect(calcularPromedioDias([
      { entregada_at: '2026-10-01T15:00:00Z' },
      { entregada_at: '2026-10-15T15:00:00Z' },
    ])).toBeNull();

    expect(calcularPromedioDias([
      { entregada_at: '2026-10-01T15:00:00Z' },
      { entregada_at: '2026-10-11T15:00:00Z' },
      { entregada_at: '2026-10-21T15:00:00Z' },
    ])).toMatchObject({ promedioDias: 10, serviciosBase: 3 });
  });

  it('programa a las 09:00 de Bogotá del día anterior', () => {
    expect(fechaProgramada('2026-11-20').toISOString()).toBe('2026-11-19T14:00:00.000Z');
  });
});

describe('HU-36 programación', () => {
  it('crea el recordatorio y su correo en cola cuando hay tres servicios y autorización', async () => {
    const tenant = tenantProgramable({
      ordenes: [
        { entregada_at: '2026-10-01T15:00:00Z' },
        { entregada_at: '2026-10-15T15:00:00Z' },
        { entregada_at: '2026-10-29T15:00:00Z' },
      ],
    });
    let creados = 0;
    tenant.crear.mockImplementation(async (tabla, valores) => {
      creados += 1;
      return { id: tabla === 'recordatorios' ? RECORDATORIO_ID : NOTIFICACION_ID, ...valores };
    });

    const resultado = await programarRecordatorio(tenant, VEHICULO_ID, { ahora: AHORA });

    expect(resultado.estado).toBe('programado');
    expect(tenant.crear).toHaveBeenNthCalledWith(1, 'recordatorios', expect.objectContaining({
      cliente_id: CLIENTE_ID,
      vehiculo_id: VEHICULO_ID,
      fecha_estimada: '2026-11-12',
      promedio_dias: 14,
      servicios_base: 3,
    }));
    const [, notificacion] = tenant.crear.mock.calls[1];
    expect(notificacion).toMatchObject({
      tipo: 'recordatorio',
      evento: EVENTOS.RECORDATORIO,
      canal: 'correo',
      estado: 'programada',
      contenido: { recordatorioId: RECORDATORIO_ID },
      clave_dedupe: `recordatorio:${RECORDATORIO_ID}`,
    });
    expect(descifrar(notificacion.destino)).toBe('ana@correo.com');
    expect(creados).toBe(2);
  });

  it('cancela el vigente sin programar si todavía no hay tres servicios', async () => {
    const tenant = tenantProgramable({
      ordenes: [
        { entregada_at: '2026-10-01T15:00:00Z' },
        { entregada_at: '2026-10-15T15:00:00Z' },
      ],
    });
    tenant.listar.mockImplementation((tabla) => {
      const respuestas = {
        vehiculos: { data: { id: VEHICULO_ID, placa: 'XYZ987', cliente_id: CLIENTE_ID, recordatorios_activos: true }, error: null },
        clientes: { data: { id: CLIENTE_ID, nombre: 'Ana', correo: 'ana@correo.com' }, error: null },
        ordenes: { data: [{ entregada_at: '2026-10-01T15:00:00Z' }, { entregada_at: '2026-10-15T15:00:00Z' }], error: null },
        recordatorios: { data: [{ id: RECORDATORIO_ID, notificacion_id: NOTIFICACION_ID }], error: null },
        notificaciones: { data: { id: NOTIFICACION_ID, estado: 'programada' }, error: null },
      };
      const builder = {
        eq: () => builder,
        maybeSingle: async () => respuestas[tabla] ?? { data: null, error: null },
        then: (ok) => Promise.resolve(respuestas[tabla] ?? { data: [], error: null }).then(ok),
      };
      return builder;
    });

    const resultado = await programarRecordatorio(tenant, VEHICULO_ID, { ahora: AHORA });

    expect(resultado).toMatchObject({ estado: 'omitido', motivo: 'servicios_insuficientes' });
    expect(tenant.crear).not.toHaveBeenCalled();
    expect(tenant.actualizar).toHaveBeenCalledWith('recordatorios', RECORDATORIO_ID, expect.objectContaining({
      estado: 'cancelado',
      motivo_cancelacion: 'servicios_insuficientes',
    }));
  });

  it('respeta la baja del vehículo y no vuelve a programar', async () => {
    const tenant = tenantProgramable({ ordenes: [], activos: false });
    const resultado = await programarRecordatorio(tenant, VEHICULO_ID, { ahora: AHORA });
    expect(resultado).toMatchObject({ estado: 'omitido', motivo: 'recordatorios_desactivados' });
    expect(tenant.crear).not.toHaveBeenCalled();
  });

  it('cancela el recordatorio vigente al registrar un servicio nuevo', async () => {
    const tenant = crearTenantFalso({
      recordatorios: [{ data: [{ id: RECORDATORIO_ID, notificacion_id: NOTIFICACION_ID }], error: null }],
      notificaciones: [{ data: { id: NOTIFICACION_ID, estado: 'programada' }, error: null }],
    });

    await cancelarPorNuevoServicio(tenant, VEHICULO_ID);

    expect(tenant.actualizar).toHaveBeenCalledWith('recordatorios', RECORDATORIO_ID, expect.objectContaining({
      estado: 'cancelado',
      motivo_cancelacion: 'nuevo_servicio',
    }));
    expect(tenant.actualizar).toHaveBeenCalledWith('notificaciones', NOTIFICACION_ID, expect.objectContaining({
      estado: 'cancelada',
    }));
  });
});

describe('HU-36 enlace de baja', () => {
  it('firma y valida solo el vehículo indicado', () => {
    const token = crearTokenRecordatorio({
      establecimientoId: ESTABLECIMIENTO_ID,
      clienteId: CLIENTE_ID,
      vehiculoId: VEHICULO_ID,
    });
    expect(leerTokenRecordatorio(token)).toEqual({
      establecimientoId: ESTABLECIMIENTO_ID,
      clienteId: CLIENTE_ID,
      vehiculoId: VEHICULO_ID,
    });
    expect(leerTokenRecordatorio(`${token}x`)).toBeNull();
    expect(enlaceRecordatorio({
      establecimientoId: ESTABLECIMIENTO_ID,
      clienteId: CLIENTE_ID,
      vehiculoId: VEHICULO_ID,
    }, 'https://panel.example')).toBe(`https://panel.example/recordatorios/${token}/desactivar`);
  });
});

describe('HU-36 worker', () => {
  it('reconstruye el correo y marca el recordatorio como enviado', async () => {
    const tenant = crearTenantFalso({
      recordatorios: [{ data: { id: RECORDATORIO_ID, cliente_id: CLIENTE_ID, vehiculo_id: VEHICULO_ID, fecha_estimada: '2026-11-20', estado: 'programado' }, error: null }],
      vehiculos: [{ data: { id: VEHICULO_ID, placa: 'XYZ987', recordatorios_activos: true }, error: null }],
      clientes: [{ data: { id: CLIENTE_ID, nombre: 'Ana Gómez' }, error: null }],
      establecimientos: [{ data: { nombre: 'Lavadero Norte', telefono: '3001234567' }, error: null }],
      autorizaciones_vigentes: [{ data: [{ tipo: 'comerciales', otorgado: true }], error: null }],
    });
    const enviar = vi.fn(async () => ({ idProveedor: 'proveedor-1' }));
    const fila = {
      id: NOTIFICACION_ID,
      canal: 'correo',
      evento: EVENTOS.RECORDATORIO,
      estado: 'enviando',
      intentos: 0,
      destino: 'v1:destino',
      contenido: { recordatorioId: RECORDATORIO_ID },
    };

    const resultado = await enviarUnIntento(tenant, fila, { proveedor: { nombre: 'prueba', enviar }, ahora: AHORA });

    expect(resultado).toMatchObject({ estado: 'enviada', intentos: 1 });
    expect(enviar).toHaveBeenCalledWith(expect.objectContaining({
      para: expect.any(String),
      asunto: expect.stringContaining('XYZ987'),
    }));
    expect(tenant.actualizar).toHaveBeenCalledWith('recordatorios', RECORDATORIO_ID, expect.objectContaining({
      estado: 'enviado',
      enviado_at: AHORA.toISOString(),
    }));
  });
});
