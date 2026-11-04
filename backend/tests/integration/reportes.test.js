// HU-16 — Permisos y contrato de los reportes, probados contra la API real.
// Requiere backend/.env y backend/.env.spike.local (ver tests/helpers/entorno.js); sin ellos se omite.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { hayEntornoIntegracion, faltantes } from '../helpers/entorno.js';

const EST_A = '00000000-0000-0000-0000-00000000a058';
const RANGO = 'desde=2026-11-01&hasta=2026-11-03';

describe.skipIf(!hayEntornoIntegracion)(`Reportes HU-16${hayEntornoIntegracion ? '' : ` (omitida: faltan ${faltantes.join(', ')})`}`, () => {
  let request, app, admin, crearCliente;
  const tokens = {};
  const operario = { email: `hu16-operario-${Date.now()}@zaru.test`, password: `Hu16-${randomUUID()}` };

  async function iniciarSesion(email, password) {
    const cliente = crearCliente(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const { data, error } = await cliente.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return { cliente, token: data.session.access_token };
  }
  const con = (quien) => (r) => r.set('Authorization', `Bearer ${tokens[quien]}`);

  beforeAll(async () => {
    request = (await import('supertest')).default;
    app = (await import('../../src/app.js')).default;
    admin = (await import('../../src/config/supabase.js')).supabase;
    ({ createClient: crearCliente } = await import('@supabase/supabase-js'));

    const { data, error } = await admin.auth.admin.createUser({ email: operario.email, password: operario.password, email_confirm: true });
    if (error) throw error;
    operario.id = data.user.id;
    await admin.from('perfiles').insert({ id: operario.id, establecimiento_id: EST_A, nombre: '[Prueba HU-16] Operario', rol: 'operario' }).throwOnError();

    tokens.admin = (await iniciarSesion(process.env.SPIKE_A_EMAIL, process.env.SPIKE_PASSWORD)).token;
    tokens.operario = (await iniciarSesion(operario.email, operario.password)).token;
  });

  afterAll(async () => {
    if (operario.id) await admin.auth.admin.deleteUser(operario.id);
  });

  it('CA1: el administrador obtiene el ranking de servicios del rango', async () => {
    const res = await request(app).get(`/api/reportes/servicios?${RANGO}`).use(con('admin'));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ desde: '2026-11-01', hasta: '2026-11-03' });
    expect(Array.isArray(res.body.servicios)).toBe(true);
    expect(typeof res.body.totalOrdenes).toBe('number');
  });

  it('CA2: el administrador obtiene la matriz de afluencia de 7 días por 12 franjas', async () => {
    const res = await request(app).get(`/api/reportes/afluencia?${RANGO}`).use(con('admin'));
    expect(res.status).toBe(200);
    expect(res.body.matriz).toHaveLength(7);
    expect(res.body.matriz.every((fila) => fila.length === 12)).toBe(true);
    expect(res.body.franjas).toHaveLength(12);
  });

  it('un rango invertido responde 400 VALIDACION', async () => {
    const res = await request(app).get('/api/reportes/servicios?desde=2026-11-03&hasta=2026-11-01').use(con('admin'));
    expect(res.status).toBe(400);
    expect(res.body.error.codigo).toBe('VALIDACION');
    expect(res.body.error.detalles[0].campo).toBe('desde');
  });

  it.each(['/api/reportes/servicios', '/api/reportes/afluencia'])(
    'un operario no puede consultar %s (403)',
    async (ruta) => {
      const res = await request(app).get(`${ruta}?${RANGO}`).use(con('operario'));
      expect(res.status).toBe(403);
      expect(res.body.error.codigo).toBe('SIN_PERMISO');
    },
  );
});
