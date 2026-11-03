// HU-07: catálogo de servicios probado de punta a punta contra la API y Supabase.
// Requiere backend/.env y backend/.env.spike.local; sin ellos se omite.
// Crea sus propios servicios y los borra al terminar. CA2 (precio histórico) se cubre en historial-vehiculo.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hayEntornoIntegracion, faltantes } from '../helpers/entorno.js';

const EST_A = '00000000-0000-0000-0000-00000000a058';
const EST_B = '00000000-0000-0000-0000-00000000b058';
const ETIQUETA = '[Prueba HU-07]';

describe.skipIf(!hayEntornoIntegracion)(`Servicios${hayEntornoIntegracion ? '' : ` (omitida: faltan ${faltantes.join(', ')})`}`, () => {
  let request, app, admin, tokenA, tokenB;

  const con = (token) => (r) => r.set('Authorization', `Bearer ${token}`);
  const crear = (cuerpo, token = tokenA) => request(app).post('/api/v1/servicios').use(con(token)).send(cuerpo);
  const listar = (query = '', token = tokenA) => request(app).get(`/api/v1/servicios${query}`).use(con(token));
  const editar = (id, cuerpo, token = tokenA) => request(app).patch(`/api/v1/servicios/${id}`).use(con(token)).send(cuerpo);

  async function limpiar() {
    await admin.from('servicios').delete().like('nombre', `${ETIQUETA}%`);
  }

  beforeAll(async () => {
    request = (await import('supertest')).default;
    app = (await import('../../src/app.js')).default;
    admin = (await import('../../src/config/supabase.js')).supabase;
    const { createClient } = await import('@supabase/supabase-js');
    const sesion = async (email) => {
      const anon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
      const { data, error } = await anon.auth.signInWithPassword({ email, password: process.env.SPIKE_PASSWORD });
      if (error) throw error;
      return data.session.access_token;
    };

    await limpiar();
    tokenA = await sesion(process.env.SPIKE_A_EMAIL);
    tokenB = await sesion(process.env.SPIKE_B_EMAIL);
  });

  afterAll(async () => {
    await limpiar();
  });

  describe('ESC-F2-08 y ESC-F2-09: crear, editar y desactivar', () => {
    it('CA1: crea el servicio activo en la sede de la sesión', async () => {
      const res = await crear({ nombre: `${ETIQUETA} Básico`, precio: 25000, duracionMin: 30, establecimiento_id: EST_B });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ nombre: `${ETIQUETA} Básico`, precio: 25000, duracion_min: 30, activo: true, establecimiento_id: EST_A });
    });

    it('CA1: edita nombre, precio y duración sin tocar el estado', async () => {
      const creado = await crear({ nombre: `${ETIQUETA} Premium`, precio: 40000, duracionMin: 45 });
      const res = await editar(creado.body.id, { nombre: `${ETIQUETA} Premium plus`, precio: 45000, duracionMin: 60 });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: creado.body.id, nombre: `${ETIQUETA} Premium plus`, precio: 45000, duracion_min: 60, activo: true });
    });

    it('CA3: al desactivarlo desaparece de ?activo=true pero sigue en el catálogo y en los inactivos', async () => {
      const creado = await crear({ nombre: `${ETIQUETA} Para desactivar`, precio: 30000, duracionMin: 30 });
      const res = await editar(creado.body.id, { activo: false });
      expect(res.status).toBe(200);
      expect(res.body.activo).toBe(false);

      const activos = await listar('?activo=true');
      expect(activos.body.map((s) => s.id)).not.toContain(creado.body.id);
      const inactivos = await listar('?activo=false');
      expect(inactivos.body.map((s) => s.id)).toContain(creado.body.id);
      const todos = await listar();
      expect(todos.body.find((s) => s.id === creado.body.id)).toMatchObject({ activo: false });
    });

    it('rechaza datos inválidos y una edición vacía', async () => {
      const sinDatos = await crear({ nombre: '', precio: -1, duracionMin: 0 });
      expect(sinDatos.status).toBe(400);
      expect(sinDatos.body.error.codigo).toBe('VALIDACION');

      const creado = await crear({ nombre: `${ETIQUETA} Sin cambios`, precio: 20000, duracionMin: 30 });
      const vacia = await editar(creado.body.id, {});
      expect(vacia.status).toBe(400);
      expect(vacia.body.error.detalles).toEqual([{ campo: 'body', mensaje: 'No hay datos para actualizar' }]);
    });
  });

  describe('roles y aislamiento', () => {
    it('B no ve ni edita el servicio de A', async () => {
      const creado = await crear({ nombre: `${ETIQUETA} Solo de A`, precio: 20000, duracionMin: 30 });
      expect((await listar('', tokenB)).body.map((s) => s.id)).not.toContain(creado.body.id);

      const res = await editar(creado.body.id, { precio: 1 }, tokenB);
      expect(res.status).toBe(404);
      expect(res.body.error.codigo).toBe('NO_ENCONTRADO');
    });
  });
});
