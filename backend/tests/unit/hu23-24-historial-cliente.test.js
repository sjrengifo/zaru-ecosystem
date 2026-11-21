// HU-23 / HU-24 — Pase del cliente, historial de servicios y detalle de una orden.
// Todo con tenant falso: no hay Supabase ni sesión de panel.
import { describe, it, expect } from 'vitest';
import { crearTenantFalso } from '../helpers/tenantFalso.js';

process.env.ZARU_CLAVE_CIFRADO ||= Buffer.alloc(32, 7).toString('base64');

const { firmarPase, verificarPase, crearPaseParaCliente, DURACION_PASE_MS } = await import('../../src/shared/paseCliente.js');
const { tipoLavado, vehiculosDelCliente, listarHistorial, detalleHistorial } = await import('../../src/shared/historialCliente.js');
const { accesoHistorial, filtroHistorial, idOrden } = await import('../../src/schemas/cliente.schemas.js');

const SEDE = { id: 'eeeeeeee-0000-4000-8000-000000000001', slug: 'car-wash-demo', nombre: 'Lavadero Norte', estado: 'activo' };
const CLIENTE = '22222222-0000-4000-8000-000000000002';
const ORDEN = '11111111-0000-4000-8000-000000000001';

const ordenEntregada = (extra = {}) => ({
  id: ORDEN,
  codigo_seguimiento: 'ABC12345',
  estado: 'entregado',
  subtotal: 30000,
  descuento: 5000,
  total: 25000,
  created_at: '2026-10-01T15:00:00Z',
  entregada_at: '2026-10-01T17:00:00Z',
  vehiculo: { id: 'v-1', cliente_id: CLIENTE, placa: 'ABC123', tipo: 'Automóvil', marca: 'Mazda', color: 'Gris' },
  servicios: [
    { precio: 20000, descuento: 0, servicio: { nombre: 'Lavado básico' } },
    { precio: 10000, descuento: 0, servicio: { nombre: 'Aspirado' } },
  ],
  ...extra,
});

describe('HU-23 · pase firmado del cliente', () => {
  it('firma y verifica la sede y el cliente, con caducidad de 30 minutos', () => {
    const ahora = Date.parse('2026-11-10T15:00:00Z');
    const { pase, expiraEn } = firmarPase({ establecimientoId: SEDE.id, clienteId: CLIENTE, ahora });

    expect(new Date(expiraEn).getTime()).toBe(ahora + DURACION_PASE_MS);
    expect(verificarPase(pase, { ahora })).toEqual({ establecimientoId: SEDE.id, clienteId: CLIENTE, expiraEn });
  });

  it('rechaza un pase alterado, vencido o inventado', () => {
    const ahora = Date.parse('2026-11-10T15:00:00Z');
    const { pase } = firmarPase({ establecimientoId: SEDE.id, clienteId: CLIENTE, ahora, duracionMs: 60_000 });
    const [cuerpo, firma] = pase.split('.');
    const alterado = `${cuerpo.slice(0, -1)}${cuerpo.endsWith('A') ? 'B' : 'A'}.${firma}`;
    const capturar = (funcion) => {
      try {
        funcion();
      } catch (err) {
        return err;
      }
      throw new Error('Se esperaba que el pase fuera rechazado');
    };

    for (const invalido of [alterado, 'sin-firma', '', `${cuerpo}.${firma}x`]) {
      expect(capturar(() => verificarPase(invalido, { ahora }))).toMatchObject({ codigo: 'NO_AUTENTICADO', status: 401 });
    }
    expect(capturar(() => verificarPase(pase, { ahora: ahora + 61_000 }))).toMatchObject({ codigo: 'NO_AUTENTICADO', status: 401 });
  });

  function dbFalso(respuestas) {
    const colas = Object.fromEntries(Object.entries(respuestas).map(([tabla, lista]) => [tabla, [...lista]]));
    return {
      from(tabla) {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          maybeSingle() {
            return Promise.resolve(colas[tabla]?.shift() ?? { data: null, error: null });
          },
        };
      },
    };
  }

  it('emite el pase solo cuando la placa y el celular coinciden con el vehículo de la sede', async () => {
    const db = dbFalso({
      establecimientos: [{ data: SEDE, error: null }],
      vehiculos: [{ data: { id: 'v-1', placa: 'ABC123', cliente_id: CLIENTE }, error: null }],
      clientes: [{ data: { id: CLIENTE, nombre: 'Yeliani', telefono: '3001234567' }, error: null }],
    });

    const datos = await crearPaseParaCliente('car-wash-demo', { placa: 'ABC123', celular: '+57 300 123 4567' }, { db });

    expect(datos).toMatchObject({
      sede: { slug: 'car-wash-demo', nombre: 'Lavadero Norte' },
      cliente: { nombre: 'Yeliani' },
    });
    expect(verificarPase(datos.pase)).toMatchObject({ establecimientoId: SEDE.id, clienteId: CLIENTE });
  });

  it('con un celular que no coincide responde el mismo 404 que una placa inexistente', async () => {
    const db = dbFalso({
      establecimientos: [{ data: SEDE, error: null }, { data: SEDE, error: null }],
      vehiculos: [
        { data: { id: 'v-1', placa: 'ABC123', cliente_id: CLIENTE }, error: null },
        { data: null, error: null },
      ],
      clientes: [{ data: { id: CLIENTE, nombre: 'Yeliani', telefono: '3001234567' }, error: null }],
    });

    await expect(crearPaseParaCliente('car-wash-demo', { placa: 'ABC123', celular: '3000000000' }, { db })).rejects.toMatchObject({
      codigo: 'NO_ENCONTRADO',
      status: 404,
      message: 'No encontramos un vehículo con esa placa y celular en esta sede',
    });
    await expect(crearPaseParaCliente('car-wash-demo', { placa: 'ZZZ999', celular: '3001234567' }, { db })).rejects.toMatchObject({
      codigo: 'NO_ENCONTRADO',
      message: 'No encontramos un vehículo con esa placa y celular en esta sede',
    });
  });
});

describe('HU-23 · historial de servicios entregados', () => {
  it('arma el tipo de lavado con los servicios realizados', () => {
    expect(tipoLavado([{ servicio: { nombre: 'Lavado básico' } }, { servicio: { nombre: 'Aspirado' } }])).toBe('Lavado básico + Aspirado');
    expect(tipoLavado([{ servicios: { nombre: 'Premium' } }])).toBe('Premium');
    expect(tipoLavado([])).toBe('Servicio');
  });

  it('lista solo las órdenes entregadas del cliente, de la más reciente a la más antigua', async () => {
    const tenant = crearTenantFalso({
      vehiculos: [{ data: [{ id: 'v-1', placa: 'ABC123' }, { id: 'v-2', placa: 'XYZ987' }], error: null }],
      ordenes: [{ data: [ordenEntregada(), ordenEntregada({ id: ORDEN.replace('1', '2'), entregada_at: '2026-09-01T17:00:00Z' }),], error: null }],
    });

    const datos = await listarHistorial(tenant, CLIENTE, {}, SEDE);

    expect(datos.sede).toBe('Lavadero Norte');
    expect(datos.vehiculos).toHaveLength(2);
    expect(datos.historial[0]).toEqual({
      id: ORDEN,
      codigo: 'ABC12345',
      fecha: '2026-10-01T17:00:00Z',
      sede: 'Lavadero Norte',
      placa: 'ABC123',
      tipoLavado: 'Lavado básico + Aspirado',
      servicios: [
        { nombre: 'Lavado básico', precio: 20000 },
        { nombre: 'Aspirado', precio: 10000 },
      ],
      total: 25000,
    });

    const ordenes = tenant.consultas.find((c) => c.tabla === 'ordenes');
    expect(ordenes.filtros).toEqual(
      expect.arrayContaining([
        ['in', 'vehiculo_id', ['v-1', 'v-2']],
        ['eq', 'estado', 'entregado'],
        ['order', 'entregada_at', { ascending: false, nullsFirst: false }],
        ['order', 'created_at', { ascending: false }],
      ]),
    );
  });

  it('filtra por una placa del cliente y no consulta órdenes si no tiene vehículos', async () => {
    const tenant = crearTenantFalso({
      vehiculos: [{ data: [{ id: 'v-1', placa: 'ABC123' }, { id: 'v-2', placa: 'XYZ987' }], error: null }, { data: [], error: null }],
    });

    const filtrado = await listarHistorial(tenant, CLIENTE, { placa: 'XYZ987' }, SEDE);
    expect(filtrado.historial).toEqual([]);
    const consulta = tenant.consultas.find((c) => c.tabla === 'ordenes');
    expect(consulta.filtros).toEqual(expect.arrayContaining([['in', 'vehiculo_id', ['v-2']]]));

    const vacio = await listarHistorial(tenant, CLIENTE, { placa: 'NOEXISTE' }, SEDE);
    expect(vacio).toEqual({ sede: 'Lavadero Norte', historial: [], vehiculos: [] });
    expect(tenant.consultas.filter((c) => c.tabla === 'ordenes')).toHaveLength(1); // solo la primera llamada
  });

  it('devuelve los vehículos del cliente para el filtro por placa', async () => {
    const tenant = crearTenantFalso({ vehiculos: [{ data: [{ id: 'v-1', placa: 'ABC123' }], error: null }] });
    await expect(vehiculosDelCliente(tenant, CLIENTE)).resolves.toEqual([{ id: 'v-1', placa: 'ABC123' }]);
    expect(tenant.consultas[0].filtros).toEqual(expect.arrayContaining([['eq', 'cliente_id', CLIENTE], ['order', 'placa']]));
  });
});

describe('HU-24 · detalle de un único servicio', () => {
  it('muestra los servicios exactos, la fecha, la sede y los totales de esa orden', async () => {
    const tenant = crearTenantFalso();
    tenant.obtener.mockResolvedValue(ordenEntregada());

    const detalle = await detalleHistorial(tenant, CLIENTE, ORDEN, SEDE);

    expect(detalle).toEqual({
      id: ORDEN,
      codigo: 'ABC12345',
      fecha: '2026-10-01T17:00:00Z',
      sede: 'Lavadero Norte',
      placa: 'ABC123',
      vehiculo: { tipo: 'Automóvil', marca: 'Mazda', color: 'Gris' },
      tipoLavado: 'Lavado básico + Aspirado',
      servicios: [
        { nombre: 'Lavado básico', precio: 20000, descuento: 0 },
        { nombre: 'Aspirado', precio: 10000, descuento: 0 },
      ],
      subtotal: 30000,
      descuento: 5000,
      total: 25000,
    });
    expect(tenant.obtener).toHaveBeenCalledWith('ordenes', ORDEN, expect.any(String), 'Servicio');
  });

  it('responde 404 para una orden de otro cliente, de otra sede o todavía no entregada', async () => {
    for (const fila of [
      ordenEntregada({ vehiculo: { ...ordenEntregada().vehiculo, cliente_id: 'otro-cliente' } }),
      ordenEntregada({ estado: 'listo' }),
    ]) {
      const tenant = crearTenantFalso();
      tenant.obtener.mockResolvedValue(fila);
      await expect(detalleHistorial(tenant, CLIENTE, ORDEN, SEDE)).rejects.toMatchObject({ codigo: 'NO_ENCONTRADO', status: 404 });
    }
  });
});

describe('HU-23/HU-24 · validación de entrada', () => {
  it('normaliza placa y celular del acceso', () => {
    expect(accesoHistorial.parse({ placa: ' abc-123 ', celular: '+57 300 123 4567' })).toEqual({ placa: 'ABC123', celular: '3001234567' });
  });

  it('rechaza una placa o un celular inválidos', () => {
    expect(accesoHistorial.safeParse({ placa: 'A', celular: '3001234567' }).success).toBe(false);
    expect(accesoHistorial.safeParse({ placa: 'ABC123', celular: '12345' }).success).toBe(false);
  });

  it('el filtro de placa es opcional y el id del detalle debe ser UUID', () => {
    expect(filtroHistorial.parse({}).placa).toBeUndefined();
    expect(filtroHistorial.parse({ placa: 'xyz-987' })).toEqual({ placa: 'XYZ987' });
    expect(idOrden.safeParse({ ordenId: 'no-uuid' }).success).toBe(false);
    expect(idOrden.safeParse({ ordenId: ORDEN }).success).toBe(true);
  });
});
