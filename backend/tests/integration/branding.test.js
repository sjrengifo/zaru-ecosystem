// HU-13: branding de la sede, probado de punta a punta contra la API, la base y Storage.
// Requiere backend/.env, backend/.env.spike.local y la migración 20261101190000_hu13_branding_logos aplicada; sin ellos se omite.
// No borra el logo real del establecimiento A: lo desvincula durante la prueba y lo restaura al terminar.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { hayEntornoIntegracion, faltantes } from '../helpers/entorno.js';

const EST_A = '00000000-0000-0000-0000-00000000a058';
const EST_B = '00000000-0000-0000-0000-00000000b058';
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(500 * 1024)]);

describe.skipIf(!hayEntornoIntegracion)(`Branding de la sede${hayEntornoIntegracion ? '' : ` (omitida: faltan ${faltantes.join(', ')})`}`, () => {
  let request, app, admin, anon, tokenA, tokenOperario, original;
  const operario = { email: `hu13-operario-${Date.now()}@zaru.test`, password: `Hu13-${randomUUID()}` };
  const subidos = [];

  const con = (token) => (r) => r.set('Authorization', `Bearer ${token}`);
  const subir = (buffer, nombre, token = tokenA) => request(app).post('/api/v1/establecimiento/logo').use(con(token)).attach('logo', buffer, nombre);
  const rutaDe = (url) => decodeURIComponent(url.split('/object/public/logos/')[1]);

  beforeAll(async () => {
    request = (await import('supertest')).default;
    app = (await import('../../src/app.js')).default;
    admin = (await import('../../src/config/supabase.js')).supabase;
    const { createClient } = await import('@supabase/supabase-js');
    anon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const sesion = async (email, password) => {
      const cliente = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
      const { data, error } = await cliente.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return { token: data.session.access_token, cliente };
    };

    original = (await admin.from('establecimientos').select('logo_url, color_primario, color_secundario').eq('id', EST_A).single().throwOnError()).data;
    await admin.from('establecimientos').update({ logo_url: null }).eq('id', EST_A).throwOnError();

    const { data, error } = await admin.auth.admin.createUser({ email: operario.email, password: operario.password, email_confirm: true });
    if (error) throw error;
    operario.id = data.user.id;
    await admin.from('perfiles').insert({ id: operario.id, establecimiento_id: EST_A, nombre: '[Prueba HU-13] Operario', rol: 'operario' }).throwOnError();

    ({ token: tokenA, cliente: anon } = await sesion(process.env.SPIKE_A_EMAIL, process.env.SPIKE_PASSWORD));
    tokenOperario = (await sesion(operario.email, operario.password)).token;
  });

  afterAll(async () => {
    if (subidos.length) await admin.storage.from('logos').remove(subidos);
    if (original) await admin.from('establecimientos').update(original).eq('id', EST_A);
    if (operario.id) await admin.auth.admin.deleteUser(operario.id);
  });

  describe('ESC-F4-05: logo válido (CA1, CA2)', () => {
    it('un PNG de 500 KB queda en la carpeta de la sede con URL pública, y GET /establecimiento la devuelve', async () => {
      const res = await subir(PNG, 'logo.png');
      expect(res.status).toBe(200);
      subidos.push(rutaDe(res.body.logo_url));
      expect(rutaDe(res.body.logo_url)).toMatch(new RegExp(`^${EST_A}/logo-\\d+\\.png$`));

      const publico = await fetch(res.body.logo_url); // Sin sesión: el cliente final también la ve.
      expect(publico.status).toBe(200);
      expect(publico.headers.get('content-type')).toBe('image/png');

      const consulta = await request(app).get('/api/v1/establecimiento').use(con(tokenA));
      expect(consulta.body.logo_url).toBe(res.body.logo_url);
    });

    it('un logo nuevo reemplaza al anterior y lo borra de Storage', async () => {
      const anterior = subidos.at(-1);
      const res = await subir(PNG, 'otro.png');
      expect(res.status).toBe(200);
      subidos.push(rutaDe(res.body.logo_url));

      const { data } = await admin.storage.from('logos').list(EST_A);
      expect(data.map((a) => `${EST_A}/${a.name}`)).not.toContain(anterior);
    });

    it('los colores se guardan en mayúsculas', async () => {
      const res = await request(app).put('/api/v1/establecimiento/branding').use(con(tokenA)).send({ colorPrimario: '#0f766e', colorSecundario: '#f59e0b' });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ color_primario: '#0F766E', color_secundario: '#F59E0B' });
    });
  });

  describe('ESC-F4-06: logo inválido (CA3)', () => {
    it.each([
      ['un .png que no es imagen', Buffer.from('esto no es una imagen'), 'falso.png'],
      ['un PNG de 3 MB', Buffer.concat([PNG, Buffer.alloc(2.5 * 1024 * 1024)]), 'grande.png'],
    ])('%s responde 400 con los requisitos', async (_, buffer, nombre) => {
      const res = await subir(buffer, nombre);
      expect(res.status).toBe(400);
      expect(res.body.error.detalles).toEqual([{ campo: 'logo', mensaje: 'El logo debe ser una imagen PNG o JPG de máximo 2 MB' }]);
    });

    it('un color inválido responde 400 indicando el formato', async () => {
      const res = await request(app).put('/api/v1/establecimiento/branding').use(con(tokenA)).send({ colorPrimario: 'azul', colorSecundario: '#F59E0B' });
      expect(res.status).toBe(400);
      expect(res.body.error.detalles[0]).toEqual({ campo: 'colorPrimario', mensaje: 'El color primario debe tener el formato #RRGGBB, por ejemplo #2563EB' });
    });
  });

  describe('solo el administrador cambia el branding', () => {
    it('un operario recibe 403 al subir el logo o cambiar los colores', async () => {
      expect((await subir(PNG, 'logo.png', tokenOperario)).status).toBe(403);
      const res = await request(app).put('/api/v1/establecimiento/branding').use(con(tokenOperario)).send({ colorPrimario: '#000000', colorSecundario: '#FFFFFF' });
      expect(res.status).toBe(403);
    });
  });

  describe('RNF-F4-03 / T4.6: aislamiento en Storage con el token del panel', () => {
    it('el admin de A puede escribir en logos/{A}/ pero no en logos/{B}/', async () => {
      const propia = `${EST_A}/prueba-politica-${Date.now()}.png`;
      const ajena = `${EST_B}/prueba-politica-${Date.now()}.png`;

      const { error: errorPropia } = await anon.storage.from('logos').upload(propia, PNG, { contentType: 'image/png' });
      expect(errorPropia).toBeNull();
      subidos.push(propia);

      const { error: errorAjena } = await anon.storage.from('logos').upload(ajena, PNG, { contentType: 'image/png' });
      expect(errorAjena).not.toBeNull();
      subidos.push(ajena); // Por si la política fallara, que no quede el archivo.
    });
  });
});
