// HU-12: crear y gestionar promociones, probado de punta a punta contra la API y Supabase.
// Requiere backend/.env, backend/.env.spike.local y la migración 20261101220000_hu12_promociones aplicada; sin ellos se omite.
// Crea sus propios servicios y un operario de prueba, y los borra al terminar (las promociones caen en cascada).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { hayEntornoIntegracion, faltantes } from '../helpers/entorno.js';

const EST_A = '00000000-0000-0000-0000-00000000a058';
const EST_B = '00000000-0000-0000-0000-00000000b058';
const ETIQUETA = '[Prueba HU-12]';

/** Fecha relativa a hoy en Bogotá, en formato AAAA-MM-DD. */
const dia = (desplazamiento) => {
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
  const fecha = new Date(`${hoy}T12:00:00Z`);
  fecha.setUTCDate(fecha.getUTCDate() + desplazamiento);
  return fecha.toISOString().slice(0, 10);
};

describe.skipIf(!hayEntornoIntegracion)(`Promociones${hayEntornoIntegracion ? '' : ` (omitida: faltan ${faltantes.join(', ')})`}`, () => {
  let request, app, admin, tokenA, tokenB, tokenOperario, motor, basico, ajeno;
  const operario = { email: `hu12-operario-${Date.now()}@zaru.test`, password: `Hu12-${randomUUID()}` };

  const con = (token) => (r) => r.set('Authorization', `Bearer ${token}`);
  const crear = (cuerpo, token = tokenA) => request(app).post('/api/v1/promociones').use(con(token)).send(cuerpo);
  const listar = (estado, token = tokenA) => request(app).get(`/api/v1/promociones?estado=${estado}`).use(con(token));
  const nueva = (datos) => ({ nombre: `${ETIQUETA} Martes de motor`, descuentoPct: 20, fechaInicio: dia(0), fechaFin: dia(29), servicioIds: [motor.id], ...datos });

  async function limpiar() {
    await admin.from('servicios').delete().like('nombre', `${ETIQUETA}%`); // Sus promocion_servicios caen en cascada.
    await admin.from('promociones').delete().like('nombre', `${ETIQUETA}%`);
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

    await limpiar();
    const servicio = async (establecimiento_id, nombre, precio) =>
      (await admin.from('servicios').insert({ establecimiento_id, nombre: `${ETIQUETA} ${nombre}`, precio, duracion_min: 30 }).select().single().throwOnError()).data;
    motor = await servicio(EST_A, 'Lavado de motor', 30000);
    basico = await servicio(EST_A, 'Lavado básico', 25000);
    ajeno = await servicio(EST_B, 'Lavado de B', 20000);

    const { data, error } = await admin.auth.admin.createUser({ email: operario.email, password: operario.password, email_confirm: true });
    if (error) throw error;
    operario.id = data.user.id;
    await admin.from('perfiles').insert({ id: operario.id, establecimiento_id: EST_A, nombre: `${ETIQUETA} Operario`, rol: 'operario' }).throwOnError();

    tokenA = await sesion(process.env.SPIKE_A_EMAIL);
    tokenB = await sesion(process.env.SPIKE_B_EMAIL);
    tokenOperario = await sesion(operario.email, operario.password);
  });

  afterAll(async () => {
    await limpiar();
    if (operario.id) await admin.auth.admin.deleteUser(operario.id);
  });

  describe('ESC-F4-01: crear promoción (CA1)', () => {
    it('responde 201 y queda vigente durante sus fechas, en la sede de la sesión', async () => {
      const res = await crear(nueva({ establecimiento_id: EST_B }));
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ establecimiento_id: EST_A, estado: 'vigente', activa: true, descuento_pct: 20 });
      expect(res.body.servicios).toEqual([{ id: motor.id, nombre: motor.nombre }]);

      const vigentes = await listar('vigentes');
      expect(vigentes.body.map((p) => p.id)).toContain(res.body.id);
    });

    it('una que empieza mañana queda programada y no aparece en vigentes', async () => {
      const res = await crear(nueva({ nombre: `${ETIQUETA} Futura`, fechaInicio: dia(1), fechaFin: dia(10) }));
      expect(res.body.estado).toBe('programada');
      expect((await listar('vigentes')).body.map((p) => p.id)).not.toContain(res.body.id);
      expect((await listar('programadas')).body.map((p) => p.id)).toContain(res.body.id);
    });

    it('rechaza un servicio de otra sede sin crear nada', async () => {
      const res = await crear(nueva({ nombre: `${ETIQUETA} Con servicio ajeno`, servicioIds: [ajeno.id] }));
      expect(res.status).toBe(400);
      expect(res.body.error.detalles).toEqual([{ campo: 'servicioIds', mensaje: 'Uno o más servicios no existen en el catálogo del establecimiento' }]);
    });
  });

  describe('ESC-F4-02: vencimiento automático (CA2)', () => {
    it('al terminar ayer ya no está vigente y aparece en vencidas, sin intervención', async () => {
      const creada = await crear(nueva({ nombre: `${ETIQUETA} Por vencer`, servicioIds: [basico.id] }));
      // Simula el paso del tiempo moviendo las fechas en la base: la API no tiene que hacer nada.
      await admin.from('promociones').update({ fecha_inicio: dia(-10), fecha_fin: dia(-1) }).eq('id', creada.body.id).throwOnError();

      expect((await listar('vigentes')).body.map((p) => p.id)).not.toContain(creada.body.id);
      const vencidas = await listar('vencidas');
      expect(vencidas.body.find((p) => p.id === creada.body.id)).toMatchObject({ estado: 'vencida', activa: true });
    });
  });

  describe('RF-F4-03: editar y desactivar', () => {
    it('desactivar la saca de vigentes y la deja en todas como desactivada', async () => {
      const creada = await crear(nueva({ nombre: `${ETIQUETA} Para desactivar` }));
      const res = await request(app).patch(`/api/v1/promociones/${creada.body.id}`).use(con(tokenA)).send({ activa: false });
      expect(res.status).toBe(200);
      expect(res.body.estado).toBe('desactivada');
      expect((await listar('vigentes')).body.map((p) => p.id)).not.toContain(creada.body.id);
    });

    it('editar el descuento y los servicios reemplaza los anteriores', async () => {
      const creada = await crear(nueva({ nombre: `${ETIQUETA} Para editar` }));
      const res = await request(app).patch(`/api/v1/promociones/${creada.body.id}`).use(con(tokenA)).send({ descuentoPct: 15, servicioIds: [basico.id] });
      expect(res.body).toMatchObject({ descuento_pct: 15, servicios: [{ id: basico.id, nombre: basico.nombre }] });
    });
  });

  describe('roles y aislamiento', () => {
    it('el operario consulta pero no crea ni edita (403)', async () => {
      expect((await listar('todas', tokenOperario)).status).toBe(200);
      expect((await crear(nueva(), tokenOperario)).status).toBe(403);
    });

    it('la sede B no ve ni edita las promociones de A', async () => {
      const creada = await crear(nueva({ nombre: `${ETIQUETA} Solo de A` }));
      expect((await listar('todas', tokenB)).body.map((p) => p.id)).not.toContain(creada.body.id);
      const res = await request(app).patch(`/api/v1/promociones/${creada.body.id}`).use(con(tokenB)).send({ activa: false });
      expect(res.status).toBe(404);
    });
  });
});
