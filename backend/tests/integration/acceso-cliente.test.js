// HU-17: acceso del cliente final con la placa o el celular, contra la API y Supabase.
// Requiere backend/.env, backend/.env.spike.local y la migración hu17_enlace_publico_sede.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hayEntornoIntegracion, faltantes } from '../helpers/entorno.js';

const EST_A = '00000000-0000-0000-0000-00000000a058';
const EST_B = '00000000-0000-0000-0000-00000000b058';
const TEL = '3009170001';
const PLACA = { activa: 'HUS170', entregada: 'HUS171', otraSede: 'HUS172' };
const CODIGO = { activa: 'HU17AC0001', entregada: 'HU17AC0002', otraSede: 'HU17AC0003' };
const NOMBRE = '[Prueba HU-17] Camila Ortiz';

describe.skipIf(!hayEntornoIntegracion)(`HU-17 · acceso del cliente final${hayEntornoIntegracion ? '' : ` (omitida: faltan ${faltantes.join(', ')})`}`, () => {
  let request, app, admin, limiteBusquedas, slugA;

  const buscar = (cuerpo, slug = slugA, ip = '203.0.113.17') =>
    request(app).post(`/api/v1/publico/sedes/${slug}/buscar`).set('X-Forwarded-For', ip).send(cuerpo);

  async function limpiar() {
    if (!admin) return;
    await admin.from('ordenes').delete().like('codigo_seguimiento', 'HU17AC%');
    await admin.from('clientes').delete().eq('telefono', TEL);
  }

  beforeAll(async () => {
    request = (await import('supertest')).default;
    app = (await import('../../src/app.js')).default;
    admin = (await import('../../src/config/supabase.js')).supabase;
    ({ limiteBusquedas } = await import('../../src/controllers/publico.controller.js'));

    const { data: sede } = await admin.from('establecimientos').select('slug').eq('id', EST_A).single().throwOnError();
    slugA = sede.slug;

    await limpiar();
    const nuevoCliente = async (establecimiento_id) => (await admin.from('clientes').insert({
      establecimiento_id, nombre: NOMBRE, telefono: TEL, correo: null, autorizacion_datos: true,
    }).select().single().throwOnError()).data;
    const clienteA = await nuevoCliente(EST_A);
    const clienteB = await nuevoCliente(EST_B);

    const vehiculo = async (establecimiento_id, cliente_id, placa) => (await admin.from('vehiculos').upsert(
      { establecimiento_id, cliente_id, placa, tipo: 'carro' }, { onConflict: 'establecimiento_id,placa' },
    ).select().single().throwOnError()).data;
    const orden = (establecimiento_id, vehiculo_id, estado, codigo) => admin.from('ordenes').insert({
      establecimiento_id, vehiculo_id, estado, subtotal: 25000, descuento: 0, total: 25000, codigo_seguimiento: codigo,
      ...(estado === 'entregado' ? { entregada_at: new Date().toISOString() } : {}),
    }).throwOnError();

    await orden(EST_A, (await vehiculo(EST_A, clienteA.id, PLACA.activa)).id, 'en_lavado', CODIGO.activa);
    await orden(EST_A, (await vehiculo(EST_A, clienteA.id, PLACA.entregada)).id, 'entregado', CODIGO.entregada);
    await orden(EST_B, (await vehiculo(EST_B, clienteB.id, PLACA.otraSede)).id, 'listo', CODIGO.otraSede);
    limiteBusquedas.reiniciar();
  });

  afterAll(async () => {
    await limpiar();
    limiteBusquedas?.reiniciar();
  });

  it('cada sede tiene un slug público con el formato del enlace', async () => {
    expect(slugA).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    const res = await request(app).get(`/api/v1/publico/sedes/${slugA}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ slug: slugA, nombre: expect.any(String) });
    expect(res.body).not.toHaveProperty('id');
  });

  it('CA1: con la placa (escrita de cualquier forma) devuelve el código de seguimiento', async () => {
    const res = await buscar({ placa: 'hus-170' });
    expect(res.status).toBe(200);
    expect(res.body.resultados).toEqual([{ codigo: CODIGO.activa, placa: PLACA.activa }]);
    // El código abre el seguimiento de HU-18.
    const seguimiento = await request(app).get(`/api/v1/publico/seguimiento/${res.body.resultados[0].codigo}`);
    expect(seguimiento.status).toBe(200);
    expect(seguimiento.body.vehiculo.placa).toBe(PLACA.activa);
  });

  it('CA1: con el celular solo devuelve la orden activa de esa sede', async () => {
    const res = await buscar({ celular: '+57 300 917 0001' });
    expect(res.status).toBe(200);
    expect(res.body.resultados).toEqual([{ codigo: CODIGO.activa, placa: PLACA.activa }]);
  });

  it('CA4 y RNF-F5-04: sin servicio activo responde el mismo 404 y nunca datos personales', async () => {
    const casos = [{ placa: PLACA.entregada }, { placa: 'ZZZ999' }, { placa: PLACA.otraSede }, { celular: '3000000000' }];
    for (const cuerpo of casos) {
      const res = await buscar(cuerpo, slugA, '203.0.113.18');
      expect(res.status).toBe(404);
      expect(res.body.error.mensaje).toBe('El vehículo no se encuentra en servicio actualmente');
    }
    const encontrado = await buscar({ celular: TEL });
    expect(JSON.stringify(encontrado.body)).not.toMatch(/Camila|Ortiz|3009170001/);
  });

  it('RNF-F5-01: tras 5 búsquedas sin resultado desde el mismo origen responde 429', async () => {
    limiteBusquedas.reiniciar();
    for (let i = 0; i < 5; i += 1) expect((await buscar({ placa: 'ZZZ999' }, slugA, '203.0.113.19')).status).toBe(404);
    expect((await buscar({ placa: PLACA.activa }, slugA, '203.0.113.19')).status).toBe(429);
    expect((await buscar({ placa: PLACA.activa }, slugA, '203.0.113.20')).status).toBe(200);
  });

  it('una sede inexistente responde 404 y un dato mal escrito responde 400', async () => {
    expect((await request(app).get('/api/v1/publico/sedes/no-existe-hu17')).status).toBe(404);
    const invalido = await buscar({ placa: '#' }, slugA, '203.0.113.21');
    expect(invalido.status).toBe(400);
    expect(invalido.body.error.detalles[0].campo).toBe('placa');
  });
});
