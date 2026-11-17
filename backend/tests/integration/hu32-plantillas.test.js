// HU-32 · ESC-F7-01 a ESC-F7-03 y aislamiento: plantillas de notificación probadas contra la API y
// Supabase. Requiere backend/.env, backend/.env.spike.local (administradores de las sedes A y B del
// spike HU-58) y la migración 20261117120000_hu32_plantillas_notificacion; sin ellos se omite.
//
// Guarda las plantillas propias que ya tuvieran A y B, las cambia durante la prueba y al terminar
// deja exactamente las que había.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hayEntornoIntegracion, faltantes } from '../helpers/entorno.js';

const EST_A = '00000000-0000-0000-0000-00000000a058';
const EST_B = '00000000-0000-0000-0000-00000000b058';
const TEXTO_A = '{sede}: [Prueba HU-32 A] {nombre_cliente}, tu carro {placa} ya esta listo.';
const TEXTO_B = '{sede}: [Prueba HU-32 B] {placa} listo a las {hora}.';

describe.skipIf(!hayEntornoIntegracion)(`HU-32 · plantillas de notificación${hayEntornoIntegracion ? '' : ` (omitida: faltan ${faltantes.join(', ')})`}`, () => {
  let request, app, admin, crearAccesoTenant, armarMensaje;
  const tokens = {};
  let originales = [];

  async function iniciarSesion(email) {
    const { createClient } = await import('@supabase/supabase-js');
    const anon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const { data, error } = await anon.auth.signInWithPassword({ email, password: process.env.SPIKE_PASSWORD });
    if (error) throw error;
    return data.session.access_token;
  }

  /** Cliente de Supabase con la sesión de un administrador (pasa por RLS, como el panel). */
  async function clienteConSesion(token) {
    const { createClient } = await import('@supabase/supabase-js');
    return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
  }

  const conSesion = (metodo, ruta, quien, cuerpo) => {
    const peticion = request(app)[metodo](`/api/v1${ruta}`).set('Authorization', `Bearer ${tokens[quien]}`);
    return cuerpo ? peticion.send(cuerpo) : peticion;
  };
  const plantilla = (res, estado, canal) => res.body.plantillas.find((p) => p.estado === estado && p.canal === canal);
  const borrarPropias = () => admin.from('plantillas_notificacion').delete().in('establecimiento_id', [EST_A, EST_B]).throwOnError();

  beforeAll(async () => {
    request = (await import('supertest')).default;
    app = (await import('../../src/app.js')).default;
    admin = (await import('../../src/config/supabase.js')).supabase;
    ({ crearAccesoTenant } = await import('../../src/shared/tenant.js'));
    ({ armarMensaje } = await import('../../src/shared/plantillasNotificacion.js'));

    const { data } = await admin.from('plantillas_notificacion').select('*').in('establecimiento_id', [EST_A, EST_B]).throwOnError();
    originales = data ?? [];
    await borrarPropias();

    tokens.A = await iniciarSesion(process.env.SPIKE_A_EMAIL);
    tokens.B = await iniciarSesion(process.env.SPIKE_B_EMAIL);
  });

  afterAll(async () => {
    if (!admin) return;
    await borrarPropias();
    if (originales.length) await admin.from('plantillas_notificacion').insert(originales).throwOnError();
  });

  it('RF-F7-05: sin personalizar, la sede ve las 15 plantillas de la plataforma', async () => {
    const res = await conSesion('get', '/plantillas', 'A');
    expect(res.status).toBe(200);
    expect(res.body.plantillas).toHaveLength(15);
    expect(res.body.plantillas.every((p) => p.personalizada === false && p.cuerpo === p.plataforma.cuerpo)).toBe(true);
    expect(res.body.variables.map((v) => v.nombre)).toEqual(['nombre_cliente', 'placa', 'estado', 'sede', 'hora']);
  });

  it('CA1: A guarda su SMS de "listo" y lo ve personalizado', async () => {
    const res = await conSesion('put', '/plantillas/listo/sms', 'A', { cuerpo: TEXTO_A });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ estado: 'listo', canal: 'sms', cuerpo: TEXTO_A, personalizada: true, asunto: null, segmentos: 1, codificacion: 'GSM-7' });
    expect(plantilla(await conSesion('get', '/plantillas', 'A'), 'listo', 'sms')).toMatchObject({ cuerpo: TEXTO_A, personalizada: true });
  });

  it('aislamiento: B no ve la plantilla de A y sigue con la de la plataforma', async () => {
    const res = await conSesion('get', '/plantillas', 'B');
    expect(plantilla(res, 'listo', 'sms')).toMatchObject({ personalizada: false });
    expect(JSON.stringify(res.body)).not.toContain('[Prueba HU-32 A]');
  });

  it('aislamiento: lo que B guarda y restaura nunca cambia la plantilla de A', async () => {
    expect((await conSesion('put', '/plantillas/listo/sms', 'B', { cuerpo: TEXTO_B })).status).toBe(200);
    expect(plantilla(await conSesion('get', '/plantillas', 'A'), 'listo', 'sms').cuerpo).toBe(TEXTO_A);

    const restaurada = await conSesion('delete', '/plantillas/listo/sms', 'B');
    expect(restaurada.body).toMatchObject({ personalizada: false });
    expect(plantilla(await conSesion('get', '/plantillas', 'A'), 'listo', 'sms').cuerpo).toBe(TEXTO_A);
  });

  it('aislamiento en la base (RLS): con su sesión, B solo lee las suyas y las de la plataforma, y no puede escribir', async () => {
    const b = await clienteConSesion(tokens.B);
    const { data, error } = await b.from('plantillas_notificacion').select('establecimiento_id, cuerpo');
    expect(error).toBeNull();
    expect(data.every((f) => f.establecimiento_id === null || f.establecimiento_id === EST_B)).toBe(true);
    expect(JSON.stringify(data)).not.toContain('[Prueba HU-32 A]');

    const insertar = await b.from('plantillas_notificacion').insert({ establecimiento_id: EST_A, estado: 'listo', canal: 'push', cuerpo: 'intruso' });
    expect(insertar.error).not.toBeNull();
    await b.from('plantillas_notificacion').update({ cuerpo: 'intruso' }).eq('establecimiento_id', EST_A);
    await b.from('plantillas_notificacion').delete().eq('establecimiento_id', EST_A);
    const { data: deA } = await admin.from('plantillas_notificacion').select('cuerpo').eq('establecimiento_id', EST_A).throwOnError();
    expect(deA.map((f) => f.cuerpo)).toEqual([TEXTO_A]);
  });

  it('CA4 / ESC-F7-01: una variable mal escrita responde 400 con la variable y su posición, y no se guarda', async () => {
    const res = await conSesion('put', '/plantillas/listo/push', 'A', { cuerpo: 'Hola {nombre_clente}' });
    expect(res.status).toBe(400);
    expect(res.body.error.detalles).toEqual([expect.objectContaining({ campo: 'cuerpo', variable: '{nombre_clente}', posicion: 5, sugerencia: '{nombre_cliente}' })]);
    expect(plantilla(await conSesion('get', '/plantillas', 'A'), 'listo', 'push').personalizada).toBe(false);
  });

  it('CA2 / ESC-F7-02: un SMS de 200 caracteres se guarda con 2 partes y la advertencia de costo', async () => {
    const cuerpo = `{sede}: ${'a'.repeat(192)}`;
    const res = await conSesion('put', '/plantillas/entregado/sms', 'A', { cuerpo });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ caracteres: 200, segmentos: 2 });
    expect(res.body.advertencias[0]).toContain('2 partes y tendrá mayor costo');
  });

  it('CA3 / ESC-F7-03: la vista previa trae push, SMS y correo con datos de ejemplo y la marca de A', async () => {
    const { data: sedeA } = await admin.from('establecimientos').select('nombre, logo_url, color_primario').eq('id', EST_A).single().throwOnError();
    const res = await conSesion('post', '/plantillas/vista-previa', 'A', { estado: 'listo', canal: 'push', asunto: 'Listo', cuerpo: '{nombre_cliente}, {placa} está {estado}.' });
    expect(res.status).toBe(200);
    expect(res.body.push).toEqual({ titulo: 'Listo', texto: 'Laura, ABC123 está listo para recoger.' });
    expect(res.body.sms.texto).toBe(`${sedeA.nombre}: [Prueba HU-32 A] Laura, tu carro ABC123 ya esta listo.`);
    expect(res.body.correo.html).toContain(sedeA.nombre.replaceAll('&', '&amp;'));
    expect(res.body.sede).toMatchObject({ nombre: sedeA.nombre, logoUrl: sedeA.logo_url ?? null });
    // La vista previa no guarda.
    expect(plantilla(await conSesion('get', '/plantillas', 'A'), 'listo', 'push').personalizada).toBe(false);
  });

  it('armarMensaje (envío de HU-46/HU-28): A usa su plantilla y B la de la plataforma', async () => {
    const datos = { cliente: { nombre: 'Ana Ruiz' }, vehiculo: { placa: 'QWE123' }, momento: '2026-11-17T15:00:00Z' };
    const deA = await armarMensaje(crearAccesoTenant(admin, { establecimientoId: EST_A }), { estado: 'orden.lista', canal: 'sms', datos });
    const deB = await armarMensaje(crearAccesoTenant(admin, { establecimientoId: EST_B }), { estado: 'orden.lista', canal: 'sms', datos });
    expect(deA).toMatchObject({ origen: 'sede' });
    expect(deA.texto).toContain('[Prueba HU-32 A] Ana, tu carro QWE123');
    expect(deB.origen).toBe('plataforma');
    expect(deB.texto).not.toContain('[Prueba HU-32');
  });

  it('restaurar devuelve a A al texto de la plataforma', async () => {
    const res = await conSesion('delete', '/plantillas/listo/sms', 'A');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ personalizada: false });
    expect(res.body.cuerpo).toBe(res.body.plataforma.cuerpo);
  });
});
