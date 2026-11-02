// HU-04: buscar y editar clientes, probado de punta a punta contra la API y Supabase.
// Requiere backend/.env y backend/.env.spike.local; sin ellos se omite.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hayEntornoIntegracion, faltantes } from '../helpers/entorno.js';

const EST_A = '00000000-0000-0000-0000-00000000a058';
const TEL = { jose: '3004040401', luis: '3004040402', nuevo: '3004040403' };
const PLACA = 'HUA404';

describe.skipIf(!hayEntornoIntegracion)(`Consulta y edición de clientes${hayEntornoIntegracion ? '' : ` (omitida: faltan ${faltantes.join(', ')})`}`, () => {
  let request, app, admin, tokenA, tokenB, jose, luis, hayFuncionBusqueda;

  const con = (token) => (r) => r.set('Authorization', `Bearer ${token}`);
  const buscar = (texto, token = tokenA) => request(app).get('/api/v1/clientes').query({ buscar: texto }).use(con(token));
  const ids = (res) => res.body.map((c) => c.id);

  async function limpiar() {
    await admin.from('clientes').delete().in('telefono', Object.values(TEL));
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
    tokenA = await sesion(process.env.SPIKE_A_EMAIL);
    tokenB = await sesion(process.env.SPIKE_B_EMAIL);

    await limpiar();
    const crear = async (nombre, telefono) =>
      (await admin.from('clientes').insert({ establecimiento_id: EST_A, nombre, telefono, autorizacion_datos: true }).select().single().throwOnError()).data;
    jose = await crear('[Prueba HU-04] José Núñez', TEL.jose);
    luis = await crear('[Prueba HU-04] Luis', TEL.luis);
    await admin.from('vehiculos').insert({ establecimiento_id: EST_A, cliente_id: jose.id, placa: PLACA, tipo: 'carro' }).throwOnError();

    const { error } = await admin.rpc('buscar_clientes', { p_establecimiento_id: EST_A, p_texto: 'x' });
    hayFuncionBusqueda = error?.code !== 'PGRST202';
  });

  afterAll(async () => {
    await limpiar();
  });

  describe('CA1: buscar por nombre, teléfono o placa', () => {
    it.each([
      ['nombre parcial', 'Prueba HU-04] José'],
      ['nombre en otras mayúsculas', 'JOSÉ NÚÑEZ'],
      ['teléfono parcial', '30040404'],
      ['teléfono con espacios', '300 404 0401'],
      ['placa', PLACA],
      ['placa en minúsculas y con guion', 'hua-404'],
    ])('encuentra por %s', async (_, texto) => {
      const res = await buscar(texto);
      expect(res.status).toBe(200);
      expect(ids(res)).toContain(jose.id);
    });

    it('sin distinguir tildes: "jose nunez" encuentra a José Núñez', async (ctx) => {
      if (!hayFuncionBusqueda) ctx.skip(); // Requiere la migración hu04_busqueda_clientes_sin_tildes.
      expect(ids(await buscar('jose nunez'))).toContain(jose.id);
    });

    it('un resultado incluye sus vehículos y no trae clientes que no coinciden', async () => {
      const res = await buscar(PLACA);
      expect(ids(res)).not.toContain(luis.id);
      expect(res.body.find((c) => c.id === jose.id).vehiculos).toEqual([{ placa: PLACA }]);
    });

    it('un texto sin coincidencias responde una lista vacía', async () => {
      expect((await buscar('zzz-no-existe-404')).body).toEqual([]);
    });

    it('otro establecimiento no encuentra al cliente ni por su placa', async () => {
      expect(ids(await buscar(PLACA, tokenB))).not.toContain(jose.id);
      expect(ids(await buscar(TEL.jose, tokenB))).not.toContain(jose.id);
    });
  });

  describe('CA2: editar los datos de un cliente', () => {
    const editar = (id, cuerpo, token = tokenA) => request(app).put(`/api/v1/clientes/${id}`).use(con(token)).send(cuerpo);

    it('actualiza nombre, teléfono y correo, y el cambio se ve en la lista', async () => {
      const res = await editar(jose.id, { nombre: '[Prueba HU-04] José Editado', telefono: TEL.nuevo, correo: 'jose.hu04@correo.com' });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ nombre: '[Prueba HU-04] José Editado', telefono: TEL.nuevo, correo: 'jose.hu04@correo.com' });
      const fila = (await buscar(TEL.nuevo)).body.find((c) => c.id === jose.id);
      expect(fila).toMatchObject({ nombre: '[Prueba HU-04] José Editado', correo: 'jose.hu04@correo.com' });
    });

    it('un cliente sin correo se puede editar sin agregarlo', async () => {
      const res = await editar(luis.id, { nombre: '[Prueba HU-04] Luis Editado' });
      expect(res.status).toBe(200);
      expect(res.body.correo).toBeNull();
    });

    it('un teléfono de otro cliente responde 409 con ese cliente y no cambia nada', async () => {
      const res = await editar(luis.id, { telefono: TEL.nuevo });
      expect(res.status).toBe(409);
      expect(res.body.error.detalles[0]).toMatchObject({ campo: 'telefono', clienteId: jose.id });
      const { data } = await admin.from('clientes').select('telefono').eq('id', luis.id).single();
      expect(data.telefono).toBe(TEL.luis);
    });

    it('volver a enviar su propio teléfono no es un conflicto', async () => {
      expect((await editar(luis.id, { telefono: TEL.luis })).status).toBe(200);
    });

    it('otro establecimiento recibe 404 y el cliente no cambia', async () => {
      const res = await editar(luis.id, { nombre: 'Intruso' }, tokenB);
      expect(res.status).toBe(404);
      const { data } = await admin.from('clientes').select('nombre').eq('id', luis.id).single();
      expect(data.nombre).not.toBe('Intruso');
    });
  });
});
