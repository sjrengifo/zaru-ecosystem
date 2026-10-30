// HU-52: eliminar los datos de un cliente, probado de punta a punta contra la API y Supabase.
// Requiere backend/.env, backend/.env.spike.local y la migración hu52_eliminar_cliente; sin ellos se omite.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { hayEntornoIntegracion, faltantes } from '../helpers/entorno.js';

const EST_A = '00000000-0000-0000-0000-00000000a058';
const TEL = { ana: '3008080801', enCurso: '3008080802', conservar: '3008080803' };
const ETIQUETA = '[Prueba HU-52]';

describe.skipIf(!hayEntornoIntegracion)(`Eliminar cliente${hayEntornoIntegracion ? '' : ` (omitida: faltan ${faltantes.join(', ')})`}`, () => {
  let request, app, admin, tokenA, tokenB, tokenOperario, operarioId, hayFuncion;
  let ana, enCurso, conservar, ordenEntregada, ordenActiva;

  const con = (token) => (r) => r.set('Authorization', `Bearer ${token}`);
  const eliminar = (id, token = tokenA) => request(app).delete(`/api/v1/clientes/${id}`).use(con(token));
  const buscar = (texto) => request(app).get('/api/v1/clientes').query({ buscar: texto }).use(con(tokenA));
  const requiereFuncion = (ctx) => hayFuncion || ctx.skip();

  async function limpiar() {
    const { data: vehiculos } = await admin.from('vehiculos').select('id').in('placa', ['HUE521', 'HUE522', 'HUE523']).eq('establecimiento_id', EST_A);
    const ids = (vehiculos ?? []).map((v) => v.id);
    if (ids.length) await admin.from('ordenes').delete().in('vehiculo_id', ids);
    await admin.from('clientes').delete().in('telefono', Object.values(TEL)).eq('establecimiento_id', EST_A);
  }

  beforeAll(async () => {
    request = (await import('supertest')).default;
    app = (await import('../../src/app.js')).default;
    admin = (await import('../../src/config/supabase.js')).supabase;
    const { createClient } = await import('@supabase/supabase-js');
    const sesion = async (email, password = process.env.SPIKE_PASSWORD) => {
      const anon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
      const { data, error } = await anon.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return data.session.access_token;
    };
    tokenA = await sesion(process.env.SPIKE_A_EMAIL);
    tokenB = await sesion(process.env.SPIKE_B_EMAIL);

    const operario = { email: `hu52-operario-${Date.now()}@zaru.test`, password: `Hu52-${randomUUID()}` };
    const { data: usuario, error } = await admin.auth.admin.createUser({ ...operario, email_confirm: true });
    if (error) throw error;
    operarioId = usuario.user.id;
    await admin.from('perfiles').insert({ id: operarioId, establecimiento_id: EST_A, nombre: `${ETIQUETA} Operario`, rol: 'operario' }).throwOnError();
    tokenOperario = await sesion(operario.email, operario.password);

    const prueba = await admin.rpc('eliminar_cliente', { p_establecimiento_id: EST_A, p_cliente_id: randomUUID() });
    hayFuncion = prueba.error?.code !== 'PGRST202';

    await limpiar();
    const version = (await request(app).get('/api/v1/politicas-datos/vigente')).body.version;
    const registrar = async (nombre, telefono) =>
      (await request(app).post('/api/v1/clientes').use(con(tokenA)).send({ nombre: `${ETIQUETA} ${nombre}`, telefono, correo: `${telefono}@correo.com`, autorizacionDatos: true, politicaVersion: version })).body;
    ana = await registrar('Ana Núñez', TEL.ana);
    enCurso = await registrar('En Curso', TEL.enCurso);
    conservar = await registrar('Conservar', TEL.conservar);

    const { data: vehiculos } = await admin
      .from('vehiculos')
      .insert([
        { establecimiento_id: EST_A, cliente_id: ana.id, placa: 'HUE521', tipo: 'carro' },
        { establecimiento_id: EST_A, cliente_id: ana.id, placa: 'HUE522', tipo: 'moto' },
        { establecimiento_id: EST_A, cliente_id: enCurso.id, placa: 'HUE523', tipo: 'carro' },
      ])
      .select()
      .throwOnError();
    const placa = (p) => vehiculos.find((v) => v.placa === p).id;
    const crearOrden = async (vehiculo_id, estado, total) =>
      (await admin.from('ordenes').insert({ establecimiento_id: EST_A, vehiculo_id, estado, subtotal: total, total }).select().single().throwOnError()).data;
    ordenEntregada = await crearOrden(placa('HUE521'), 'entregado', 30000);
    ordenActiva = await crearOrden(placa('HUE523'), 'en_lavado', 40000);
    await admin.from('notificaciones').insert({ establecimiento_id: EST_A, cliente_id: ana.id, tipo: 'operativa', evento: 'listo', canal: 'correo', destino: `${TEL.ana}@correo.com` }).throwOnError();
  });

  afterAll(async () => {
    await limpiar();
    if (ordenEntregada) await admin.from('ordenes').delete().eq('id', ordenEntregada.id);
    if (operarioId) await admin.auth.admin.deleteUser(operarioId);
  });

  describe('permisos y aislamiento', () => {
    it('un operario recibe 403 y el intento queda en la auditoría', async () => {
      const res = await eliminar(ana.id, tokenOperario);
      expect(res.status).toBe(403);
      const { data } = await admin.from('auditoria').select('resultado').eq('recurso_id', ana.id).eq('usuario_id', operarioId);
      expect(data).toEqual([{ resultado: 'denegado' }]);
    });

    it('otro establecimiento recibe 404, igual que un cliente inexistente', async () => {
      const [ajeno, inexistente] = await Promise.all([eliminar(ana.id, tokenB), eliminar(randomUUID(), tokenB)]);
      expect(ajeno.status).toBe(404);
      expect(inexistente.status).toBe(404);
      expect(ajeno.body.error.mensaje).toBe(inexistente.body.error.mensaje);
      expect((await admin.from('clientes').select('id').eq('id', ana.id)).data).toHaveLength(1);
    });
  });

  describe('servicios en curso', () => {
    it('responde 409 y no borra nada', async (ctx) => {
      requiereFuncion(ctx);
      const res = await eliminar(enCurso.id);
      expect(res.status).toBe(409);
      expect((await admin.from('clientes').select('id').eq('id', enCurso.id)).data).toHaveLength(1);
      const { data } = await admin.from('ordenes').select('vehiculo_id').eq('id', ordenActiva.id).single();
      expect(data.vehiculo_id).not.toBeNull();
    });
  });

  describe('CA1 y CA3: eliminar los datos del cliente', () => {
    const contar = async (tabla, columna, valor) => (await admin.from(tabla).select('*', { count: 'exact', head: true }).eq(columna, valor)).count;

    it('antes de eliminarlo se encuentra por nombre, teléfono y placa', async () => {
      for (const texto of ['Ana Núñez', TEL.ana, 'HUE521']) expect((await buscar(texto)).body.map((c) => c.id)).toContain(ana.id);
    });

    it('responde 204 y borra cliente, vehículos, autorizaciones y notificaciones', async (ctx) => {
      requiereFuncion(ctx);
      expect((await eliminar(ana.id)).status).toBe(204);
      expect(await contar('clientes', 'id', ana.id)).toBe(0);
      expect(await contar('vehiculos', 'cliente_id', ana.id)).toBe(0);
      expect(await contar('consentimientos', 'cliente_id', ana.id)).toBe(0);
      expect(await contar('notificaciones', 'cliente_id', ana.id)).toBe(0);
    });

    it('CA3: ya no aparece al buscar por nombre, teléfono o placa, ni en vehículos', async (ctx) => {
      requiereFuncion(ctx);
      for (const texto of ['Ana Núñez', 'ana nunez', TEL.ana, 'HUE521', 'HUE522']) expect((await buscar(texto)).body.map((c) => c.id)).not.toContain(ana.id);
      const vehiculos = await request(app).get('/api/v1/vehiculos').query({ placa: 'HUE52' }).use(con(tokenA));
      expect(vehiculos.body.map((v) => v.placa)).toEqual(['HUE523']);
    });

    it('su perfil ya no existe y otro cliente no se afecta', async (ctx) => {
      requiereFuncion(ctx);
      expect((await request(app).get(`/api/v1/clientes/${ana.id}`).use(con(tokenA))).status).toBe(404);
      expect((await request(app).get(`/api/v1/clientes/${conservar.id}`).use(con(tokenA))).status).toBe(200);
    });

    it('la orden entregada se conserva sin vehículo', async (ctx) => {
      requiereFuncion(ctx);
      const { data } = await admin.from('ordenes').select('vehiculo_id, total').eq('id', ordenEntregada.id).single();
      expect(data).toEqual({ vehiculo_id: null, total: 30000 });
    });

    it('queda en la auditoría sin datos personales', async (ctx) => {
      requiereFuncion(ctx);
      const { data } = await admin.from('auditoria').select('*').eq('recurso_id', ana.id).eq('accion', 'ELIMINAR_CLIENTE');
      expect(data).toHaveLength(1);
      expect(data[0]).toMatchObject({ resultado: 'permitido', recurso: 'v1', detalle: { vehiculos: 2, ordenesConservadas: 1 } });
      const texto = JSON.stringify(data[0]);
      for (const dato of ['Núñez', TEL.ana, '@correo', 'HUE521']) expect(texto).not.toContain(dato);
    });

    it('el teléfono queda libre para un registro nuevo', async (ctx) => {
      requiereFuncion(ctx);
      const version = (await request(app).get('/api/v1/politicas-datos/vigente')).body.version;
      const res = await request(app).post('/api/v1/clientes').use(con(tokenA)).send({ nombre: `${ETIQUETA} Regresa`, telefono: TEL.ana, correo: 'regresa@correo.com', autorizacionDatos: true, politicaVersion: version });
      expect(res.status).toBe(201);
    });
  });
});
