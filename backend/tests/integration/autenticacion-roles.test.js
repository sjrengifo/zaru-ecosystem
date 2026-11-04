// HU-44 (ZARU-51): autenticación y autorización por roles, probada contra la API y Supabase.
// Requiere backend/.env y backend/.env.spike.local (ver tests/helpers/entorno.js); sin ellos se omite.
// Crea un operario de prueba en el establecimiento A y lo elimina al terminar.
// Los registros de auditoría se conservan: la tabla es inmutable por diseño (CA2).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { hayEntornoIntegracion, faltantes } from '../helpers/entorno.js';

const EST_A = '00000000-0000-0000-0000-00000000a058';
const decodificar = (token) => JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));

describe.skipIf(!hayEntornoIntegracion)(`Autenticación y roles${hayEntornoIntegracion ? '' : ` (omitida: faltan ${faltantes.join(', ')})`}`, () => {
  let request, app, admin, crearCliente;
  const tokens = {};
  const operario = { email: `hu44-operario-${Date.now()}@zaru.test`, password: `Hu44-${randomUUID()}` };

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
    await admin.from('perfiles').insert({ id: operario.id, establecimiento_id: EST_A, nombre: '[Prueba HU-44] Operario', rol: 'operario' }).throwOnError();

    tokens.admin = (await iniciarSesion(process.env.SPIKE_A_EMAIL, process.env.SPIKE_PASSWORD)).token;
    tokens.operario = (await iniciarSesion(operario.email, operario.password)).token;
  });

  afterAll(async () => {
    if (operario.id) await admin.auth.admin.deleteUser(operario.id);
  });

  describe('CA1: el token tiene expiración e identifica rol y establecimiento', () => {
    it('el token de acceso vence (exp) y dura como máximo 1 hora', () => {
      const { exp, iat } = decodificar(tokens.admin);
      expect(exp).toBeGreaterThan(Date.now() / 1000);
      expect(exp - iat).toBeLessThanOrEqual(3600);
    });

    it('el token incluye los claims app_rol y establecimiento_id', () => {
      expect(decodificar(tokens.admin)).toMatchObject({ app_rol: 'admin', establecimiento_id: EST_A });
      expect(decodificar(tokens.operario)).toMatchObject({ app_rol: 'operario', establecimiento_id: EST_A });
    });

    it('GET /api/me devuelve usuario, rol, establecimiento y vencimiento de la sesión', async () => {
      const res = await request(app).get('/api/me').use(con('operario'));
      expect(res.status).toBe(200);
      expect(res.body.usuario).toMatchObject({ id: operario.id, rol: 'operario' });
      expect(res.body.establecimiento.id).toBe(EST_A);
      expect(res.body.sesion.expiraEn).toBe(new Date(decodificar(tokens.operario).exp * 1000).toISOString());
    });
  });

  describe('CA2: un operario no accede a funciones del administrador y el intento queda registrado', () => {
    it('el operario sí puede consultar el catálogo de servicios', async () => {
      const res = await request(app).get('/api/servicios').use(con('operario'));
      expect(res.status).toBe(200);
    });

    it('POST /api/servicios con un operario responde 403 y se registra como denegado', async () => {
      const res = await request(app).post('/api/servicios').use(con('operario')).send({ nombre: 'No permitido', precio: 1, duracion_min: 10 });
      expect(res.status).toBe(403);
      expect(res.body.error).toMatchObject({ codigo: 'SIN_PERMISO', mensaje: 'No tienes permiso para realizar esta acción' });
      expect(res.body.error.requestId).toBe(res.headers['x-request-id']);

      const { data } = await admin.from('auditoria').select('*').eq('request_id', res.headers['x-request-id']).single();
      expect(data).toMatchObject({
        usuario_id: operario.id,
        establecimiento_id: EST_A,
        rol: 'operario',
        accion: 'POST /api/servicios',
        recurso: 'servicios',
        resultado: 'denegado',
      });
    });

    it.each([
      ['PUT', '/api/establecimiento/branding'],
      ['GET', '/api/usuarios'],
      ['POST', '/api/promociones'],
    ])('%s %s con un operario responde 403', async (metodo, ruta) => {
      const res = await request(app)[metodo.toLowerCase()](ruta).use(con('operario')).send({});
      expect(res.status).toBe(403);
    });

    it('el administrador sí pasa la verificación de rol', async () => {
      const res = await request(app).get('/api/usuarios').use(con('admin'));
      expect(res.status).not.toBe(403);
    });

    it('la auditoría no se puede modificar ni borrar, ni siquiera con la clave del backend', async () => {
      const { error: errUpdate } = await admin.from('auditoria').update({ resultado: 'permitido' }).eq('usuario_id', operario.id);
      const { error: errDelete } = await admin.from('auditoria').delete().eq('usuario_id', operario.id);
      expect(errUpdate?.message).toMatch(/no se puede modificar/);
      expect(errDelete?.message).toMatch(/no se puede modificar/);
    });
  });

  describe('CA3: un token vencido o inválido se rechaza y se pide iniciar sesión de nuevo', () => {
    it.each([
      ['sin token', null],
      ['con un texto que no es un token', 'esto-no-es-un-jwt'],
      ['con la firma alterada', () => tokens.admin.slice(0, -4) + 'AAAA'],
    ])('responde 401 %s', async (_, valor) => {
      const token = typeof valor === 'function' ? valor() : valor;
      const peticion = request(app).get('/api/me');
      const res = await (token ? peticion.set('Authorization', `Bearer ${token}`) : peticion);
      expect(res.status).toBe(401);
      expect(res.body.error.codigo).toBe('NO_AUTENTICADO');
      expect(res.headers['www-authenticate']).toMatch(/invalid_token/);
    });

    it('un token de una sesión cerrada ya no sirve', async () => {
      const { cliente, token } = await iniciarSesion(operario.email, operario.password);
      expect((await request(app).get('/api/me').set('Authorization', `Bearer ${token}`)).status).toBe(200);
      await cliente.auth.signOut({ scope: 'local' });
      const res = await request(app).get('/api/me').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(401);
      expect(res.body.error.mensaje).toMatch(/Inicia sesión de nuevo/);
    });

    it('un operario desactivado pierde el acceso de inmediato, aunque su token siga vigente', async () => {
      await admin.from('perfiles').update({ activo: false }).eq('id', operario.id).throwOnError();
      const res = await request(app).get('/api/me').use(con('operario'));
      expect(res.status).toBe(403);
      await admin.from('perfiles').update({ activo: true }).eq('id', operario.id).throwOnError();
    });
  });
});
