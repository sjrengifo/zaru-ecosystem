// HU-34 — Bitácora de notificaciones del administrador.
// Se prueba el controlador con un req.tenant falso: filtros combinables, paginación, aislamiento,
// enmascarado del destino y detalle de intentos.
import { describe, it, expect, vi } from 'vitest';
import { crearTenantFalso, ejecutar } from '../helpers/tenantFalso.js';

process.env.ZARU_CLAVE_CIFRADO ||= Buffer.alloc(32, 7).toString('base64');

const { listar, obtener } = await import('../../src/controllers/notificaciones.controller.js');
const { filtroNotificaciones, idNotificacion } = await import('../../src/schemas/notificaciones.schemas.js');
const { cifrar } = await import('../../src/shared/cifrado.js');

const ID = '11111111-0000-4000-8000-000000000001';
const ORDEN = '22222222-0000-4000-8000-000000000002';

const filaBase = {
  id: ID,
  created_at: '2026-11-10T19:05:00Z',
  tipo: 'operativa',
  evento: 'orden.lista',
  canal: 'correo',
  estado: 'enviada',
  intentos: 2,
  error: null,
  destino: cifrar('yeliani@gmail.com'),
  contenido: { asunto: 'Tu vehículo está listo', proveedor: 'smtp', idProveedor: 'p-1', aceptadaAt: '2026-11-10T19:05:01Z', entregaConfirmada: false },
  programada_para: '2026-11-10T19:05:00Z',
  proximo_intento_at: null,
  cliente: { nombre: 'Yeliani' },
  orden: { id: ORDEN, codigo_seguimiento: 'ABC12345', vehiculo: { placa: 'XYZ987' } },
};

const consultar = (tenant, query = {}) => ejecutar(listar, { tenant, query: { pagina: 1, porPagina: 20, ...query } });

describe('GET /notificaciones · listado de la bitácora', () => {
  it('devuelve fecha, cliente, placa, canal, tipo y estado con el destino enmascarado', async () => {
    const tenant = crearTenantFalso({ notificaciones: [{ data: [filaBase], error: null, count: 1 }] });
    const { res, error } = await consultar(tenant);

    expect(error).toBeUndefined();
    expect(res.body.paginacion).toEqual({ pagina: 1, porPagina: 20, total: 1, totalPaginas: 1 });
    expect(res.body.notificaciones[0]).toMatchObject({
      id: ID,
      cliente: 'Yeliani',
      placa: 'XYZ987',
      canal: 'correo',
      tipo: 'operativa',
      estado: 'enviada',
      destino: 'yel****@gmail.com',
      aceptadaPorProveedor: true,
      entregada: false,
      totalIntentos: 2,
      error: null,
    });
  });

  it('distingue "aceptada por el proveedor" de "entregada de verdad"', async () => {
    const aceptada = { ...filaBase, estado: 'enviada', contenido: { ...filaBase.contenido, entregaConfirmada: false } };
    const entregada = { ...filaBase, id: ORDEN, estado: 'entregada' };
    const conAcuse = { ...filaBase, id: ORDEN, estado: 'enviada', contenido: { ...filaBase.contenido, entregaConfirmada: true } };

    const tenant = crearTenantFalso({ notificaciones: [{ data: [aceptada, entregada, conAcuse], error: null, count: 3 }] });
    const { res } = await consultar(tenant);

    expect(res.body.notificaciones.map((n) => [n.estado, n.aceptadaPorProveedor, n.entregada])).toEqual([
      ['enviada', true, false],
      ['entregada', true, true],
      ['enviada', true, true],
    ]);
  });

  it('combina placa, rango de fechas, canal, estado y tipo, y pagina en el servidor', async () => {
    const filtros = filtroNotificaciones.parse({
      placa: 'xyz-987',
      desde: '2026-11-01',
      hasta: '2026-11-10',
      canal: 'sms',
      estado: 'fallida',
      tipo: 'operativa',
      pagina: '2',
      porPagina: '10',
    });

    const tenant = crearTenantFalso({
      vehiculos: [{ data: [{ id: 'v-1' }], error: null }],
      ordenes: [{ data: [{ id: 'o-1' }, { id: 'o-2' }], error: null }],
      notificaciones: [{ data: [], error: null, count: 12 }],
    });

    const { res } = await consultar(tenant, filtros);
    expect(res.body.paginacion).toEqual({ pagina: 2, porPagina: 10, total: 12, totalPaginas: 2 });

    const consulta = tenant.consultas.find((c) => c.tabla === 'notificaciones');
    expect(consulta.filtros).toEqual(
      expect.arrayContaining([
        ['order', 'created_at', { ascending: false }],
        ['in', 'orden_id', ['o-1', 'o-2']],
        ['eq', 'canal', 'sms'],
        ['eq', 'estado', 'fallida'],
        ['eq', 'tipo', 'operativa'],
        ['range', 10, 19],
      ]),
    );
    // Las fechas se convierten al día completo en hora de Bogotá.
    const rango = consulta.filtros.filter(([metodo]) => metodo === 'gte' || metodo === 'lt');
    expect(rango.map(([metodo]) => metodo)).toEqual(['gte', 'lt']);
    expect(rango[0][2]).toContain('2026-11-01');
    expect(rango[1][2]).toContain('2026-11-11');
  });

  it('si la placa no tiene órdenes en la sede responde vacío sin recorrer toda la bitácora', async () => {
    const tenant = crearTenantFalso({ vehiculos: [{ data: [], error: null }] });
    const { res } = await consultar(tenant, { placa: 'ZZZ999' });

    expect(res.body).toEqual({ notificaciones: [], paginacion: { pagina: 1, porPagina: 20, total: 0, totalPaginas: 0 } });
    expect(tenant.consultas.map((c) => c.tabla)).toEqual(['vehiculos']);
  });

  it('no mezcla notificaciones de otra sede: siempre consulta con req.tenant', async () => {
    const tenant = crearTenantFalso({ notificaciones: [{ data: [], error: null, count: 0 }] });
    await consultar(tenant);
    expect(tenant.consultas[0].tabla).toBe('notificaciones');
    expect(tenant.listar).toHaveBeenCalledWith('notificaciones', expect.any(String), { count: 'exact' });
  });
});

describe('GET /notificaciones/:id · detalle e intentos', () => {
  it('devuelve cada intento con proveedor, resultado, recuperabilidad y error real', async () => {
    const tenant = crearTenantFalso({
      notificacion_intentos: [
        {
          data: [
            { intento: 1, canal: 'correo', resultado: 'fallido', proveedor: 'smtp', id_proveedor: null, entregado: false, recuperable: true, error: '503 Service Unavailable', created_at: '2026-11-10T19:05:02Z' },
            { intento: 2, canal: 'correo', resultado: 'enviado', proveedor: 'smtp', id_proveedor: 'p-1', entregado: false, recuperable: null, error: null, created_at: '2026-11-10T19:06:02Z' },
          ],
          error: null,
        },
      ],
    });
    tenant.obtener.mockResolvedValue(filaBase);

    const { res, error } = await ejecutar(obtener, { tenant, params: { id: ID } });

    expect(error).toBeUndefined();
    expect(res.body).toMatchObject({ id: ID, totalIntentos: 2, detalleIntentos: true, destino: 'yel****@gmail.com' });
    expect(res.body.intentos).toEqual([
      expect.objectContaining({ intento: 1, resultado: 'fallido', recuperable: true, error: '503 Service Unavailable', entregado: false }),
      expect.objectContaining({ intento: 2, resultado: 'enviado', idProveedor: 'p-1', entregado: false }),
    ]);
    expect(tenant.listar).toHaveBeenCalledWith('notificacion_intentos', expect.any(String));
  });

  it('si la tabla de intentos aún no existe, muestra la notificación con detalleIntentos: false', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const tenant = crearTenantFalso({ notificacion_intentos: [{ data: null, error: new Error('relation does not exist') }] });
    tenant.obtener.mockResolvedValue(filaBase);

    const { res } = await ejecutar(obtener, { tenant, params: { id: ID } });

    expect(res.body).toMatchObject({ id: ID, intentos: [], detalleIntentos: false });
    warn.mockRestore();
  });

  it('propaga el 404 de una notificación de otra sede o inexistente', async () => {
    const { noEncontrado } = await import('../../src/shared/errores.js');
    const tenant = crearTenantFalso();
    tenant.obtener.mockRejectedValue(noEncontrado('Notificación'));

    const { error } = await ejecutar(obtener, { tenant, params: { id: ID } });
    expect(error).toMatchObject({ codigo: 'NO_ENCONTRADO', status: 404 });
  });
});

describe('HU-34 · validación de los filtros', () => {
  it('normaliza la placa y aplica la paginación por defecto', () => {
    expect(filtroNotificaciones.parse({ placa: ' abc-123 ' })).toMatchObject({ placa: 'ABC123', pagina: 1, porPagina: 20 });
  });

  it('rechaza un rango invertido, un canal desconocido o una fecha imposible', () => {
    expect(filtroNotificaciones.safeParse({ desde: '2026-11-10', hasta: '2026-11-01' }).success).toBe(false);
    expect(filtroNotificaciones.safeParse({ canal: 'whatsapp' }).success).toBe(false);
    expect(filtroNotificaciones.safeParse({ desde: '2026-02-30' }).success).toBe(false);
  });

  it('exige un UUID válido en el detalle', () => {
    expect(idNotificacion.safeParse({ id: 'no-es-uuid' }).success).toBe(false);
    expect(idNotificacion.safeParse({ id: ID }).success).toBe(true);
  });
});
