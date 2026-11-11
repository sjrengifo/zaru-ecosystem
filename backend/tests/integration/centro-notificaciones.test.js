// HU-38: centro de notificaciones del cliente final, contra la API y Supabase (ESC-F6-13).
// Requiere backend/.env y backend/.env.spike.local. Usa las sedes de prueba del spike HU-58.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hayEntornoIntegracion, faltantes } from '../helpers/entorno.js';

const EST_A = '00000000-0000-0000-0000-00000000a058';
const EST_B = '00000000-0000-0000-0000-00000000b058';
const TEL = '3009380001';
const PLACA = { enCurso: 'HUS380', entregada: 'HUS381', otraSede: 'HUS382' };
const CODIGO = { enCurso: 'HU38NC0001', entregada: 'HU38NC0002', otraSede: 'HU38NC0003' };
const NOMBRE = '[Prueba HU-38] Laura Gómez';
const DIA_MS = 24 * 60 * 60 * 1000;

describe.skipIf(!hayEntornoIntegracion)(`HU-38 · centro de notificaciones${hayEntornoIntegracion ? '' : ` (omitida: faltan ${faltantes.join(', ')})`}`, () => {
  let request, app, admin, limiteAccesos, slugA, slugB, pase;
  const ids = {};

  const centro = (conPase = pase) => {
    const peticion = request(app).get('/api/v1/publico/cliente/notificaciones');
    return conPase ? peticion.set('Authorization', `Bearer ${conPase}`) : peticion;
  };
  const leer = (id, conPase = pase) =>
    request(app).patch(`/api/v1/publico/cliente/notificaciones/${id}/leida`).set('Authorization', `Bearer ${conPase}`);

  async function limpiar() {
    if (!admin) return;
    const { data: clientes } = await admin.from('clientes').select('id').eq('telefono', TEL);
    const clienteIds = (clientes ?? []).map((c) => c.id);
    if (clienteIds.length) await admin.from('notificaciones').delete().in('cliente_id', clienteIds);
    await admin.from('ordenes').delete().like('codigo_seguimiento', 'HU38NC%');
    await admin.from('clientes').delete().eq('telefono', TEL);
  }

  beforeAll(async () => {
    request = (await import('supertest')).default;
    app = (await import('../../src/app.js')).default;
    admin = (await import('../../src/config/supabase.js')).supabase;
    ({ limiteAccesos } = await import('../../src/controllers/cliente.controller.js'));

    const slugDe = async (id) => (await admin.from('establecimientos').select('slug').eq('id', id).single().throwOnError()).data.slug;
    slugA = await slugDe(EST_A);
    slugB = await slugDe(EST_B);

    await limpiar();
    const nuevoCliente = async (establecimiento_id) => (await admin.from('clientes').insert({
      establecimiento_id, nombre: NOMBRE, telefono: TEL, correo: null, autorizacion_datos: true,
    }).select().single().throwOnError()).data;
    const clienteA = await nuevoCliente(EST_A);
    const clienteB = await nuevoCliente(EST_B);

    const vehiculo = async (establecimiento_id, cliente_id, placa) => (await admin.from('vehiculos').upsert(
      { establecimiento_id, cliente_id, placa, tipo: 'carro' }, { onConflict: 'establecimiento_id,placa' },
    ).select().single().throwOnError()).data;
    const orden = async (establecimiento_id, vehiculo_id, estado, codigo) => (await admin.from('ordenes').insert({
      establecimiento_id, vehiculo_id, estado, subtotal: 25000, descuento: 0, total: 25000, codigo_seguimiento: codigo,
      ...(estado === 'entregado' ? { entregada_at: new Date().toISOString() } : {}),
    }).select().single().throwOnError()).data;

    const enCurso = await orden(EST_A, (await vehiculo(EST_A, clienteA.id, PLACA.enCurso)).id, 'en_lavado', CODIGO.enCurso);
    const entregada = await orden(EST_A, (await vehiculo(EST_A, clienteA.id, PLACA.entregada)).id, 'entregado', CODIGO.entregada);
    const otraSede = await orden(EST_B, (await vehiculo(EST_B, clienteB.id, PLACA.otraSede)).id, 'listo', CODIGO.otraSede);
    ids.ordenEntregada = entregada.id;

    const hace = (dias) => new Date(Date.now() - dias * DIA_MS).toISOString();
    const aviso = async (clave, { establecimiento_id = EST_A, cliente_id = clienteA.id, orden_id, evento, estado = 'enviada', dias, leida = false }) => {
      const { data } = await admin.from('notificaciones').insert({
        establecimiento_id, cliente_id, orden_id, tipo: 'operativa', evento, canal: 'correo',
        destino: 'destino-de-prueba-hu38', contenido: { asunto: `[HU-38] ${clave}` }, estado,
        created_at: hace(dias), leida_at: leida ? hace(dias) : null,
      }).select('id').single().throwOnError();
      ids[clave] = data.id;
    };
    await aviso('recibidaEnCurso', { orden_id: enCurso.id, evento: 'orden.recibida', dias: 1 });
    await aviso('listaEntregada', { orden_id: entregada.id, evento: 'orden.lista', dias: 3, leida: true });
    await aviso('recibidaEntregada', { orden_id: entregada.id, evento: 'orden.recibida', dias: 5 });
    // No deben aparecer: no le llegó, está fuera de los 90 días o es de otra sede.
    await aviso('fallida', { orden_id: enCurso.id, evento: 'orden.lista', estado: 'fallida', dias: 2 });
    await aviso('vieja', { orden_id: entregada.id, evento: 'orden.recibida', dias: 91 });
    await aviso('otraSede', { establecimiento_id: EST_B, cliente_id: clienteB.id, orden_id: otraSede.id, evento: 'orden.lista', dias: 1 });

    limiteAccesos.reiniciar();
    const acceso = await request(app)
      .post(`/api/v1/publico/sedes/${slugA}/historial/acceso`)
      .send({ placa: PLACA.enCurso, celular: TEL });
    expect(acceso.status).toBe(200);
    pase = acceso.body.pase;
  });

  afterAll(async () => {
    await limpiar();
    limiteAccesos?.reiniciar();
  });

  it('CA1: lista solo los avisos recibidos de los últimos 90 días, del más reciente al más antiguo, con su marca de leída', async () => {
    const res = await centro();

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.notificaciones.map((n) => [n.id, n.leida])).toEqual([
      [ids.recibidaEnCurso, false],
      [ids.listaEntregada, true],
      [ids.recibidaEntregada, false],
    ]);
    expect(res.body.notificaciones[0]).toMatchObject({ titulo: '[HU-38] recibidaEnCurso', placa: PLACA.enCurso, categoria: 'Estado del servicio' });
    expect(JSON.stringify(res.body)).not.toContain('destino-de-prueba-hu38');
  });

  it('CA2: responde cuántos avisos siguen sin leer', async () => {
    expect((await centro()).body.noLeidas).toBe(2);
  });

  it('CA3: un aviso de un vehículo en servicio lleva al seguimiento y uno ya entregado, al detalle del historial', async () => {
    const { notificaciones } = (await centro()).body;
    const enCurso = notificaciones.find((n) => n.id === ids.recibidaEnCurso);
    const entregado = notificaciones.find((n) => n.id === ids.listaEntregada);

    expect(enCurso.destino).toEqual({ pantalla: 'seguimiento', codigo: CODIGO.enCurso });
    expect((await request(app).get(`/api/v1/publico/seguimiento/${CODIGO.enCurso}`)).status).toBe(200);

    expect(entregado.destino).toEqual({ pantalla: 'historial', ordenId: ids.ordenEntregada });
    const detalle = await request(app)
      .get(`/api/v1/publico/cliente/historial/${ids.ordenEntregada}`)
      .set('Authorization', `Bearer ${pase}`);
    expect(detalle.status).toBe(200);
  });

  it('ESC-F6-13: al marcar un aviso como leído baja el contador, y repetirlo no cambia la fecha de lectura', async () => {
    const primera = await leer(ids.recibidaEnCurso);
    expect(primera.status).toBe(200);
    expect(primera.body).toMatchObject({ id: ids.recibidaEnCurso, leida: true });

    expect((await centro()).body.noLeidas).toBe(1);

    const segunda = await leer(ids.recibidaEnCurso);
    expect(segunda.body.leidaAt).toBe(primera.body.leidaAt);
  });

  it('no deja marcar un aviso que no le llegó ni uno de otra sede, y sin pase responde 401', async () => {
    expect((await leer(ids.fallida)).status).toBe(404);
    expect((await leer(ids.otraSede)).status).toBe(404);
    expect((await leer('no-es-uuid')).status).toBe(400);
    expect((await centro(null)).status).toBe(401);

    const { data } = await admin.from('notificaciones').select('leida_at').in('id', [ids.fallida, ids.otraSede]);
    expect(data.every((n) => n.leida_at === null)).toBe(true);
  });

  it('el pase de la otra sede solo ve los avisos de esa sede', async () => {
    limiteAccesos.reiniciar();
    const acceso = await request(app)
      .post(`/api/v1/publico/sedes/${slugB}/historial/acceso`)
      .send({ placa: PLACA.otraSede, celular: TEL });
    const res = await centro(acceso.body.pase);

    expect(res.body.notificaciones.map((n) => n.id)).toEqual([ids.otraSede]);
  });
});
