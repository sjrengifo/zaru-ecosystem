// HU-26 · ESC-F5-07: el cliente final de una sede solo ve las promociones vigentes de esa sede,
// probado contra la API y Supabase. Requiere backend/.env, backend/.env.spike.local y la migración
// 20261101220000_hu12_promociones; sin ellos se omite.
// Crea sus propios servicios y promociones en las sedes de prueba A y B y los borra al terminar.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hayEntornoIntegracion, faltantes } from '../helpers/entorno.js';

const EST_A = '00000000-0000-0000-0000-00000000a058';
const EST_B = '00000000-0000-0000-0000-00000000b058';
const ETIQUETA = '[Prueba HU-26]';

/** Fecha relativa a hoy en Bogotá, en formato AAAA-MM-DD. */
const dia = (desplazamiento) => {
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
  const fecha = new Date(`${hoy}T12:00:00Z`);
  fecha.setUTCDate(fecha.getUTCDate() + desplazamiento);
  return fecha.toISOString().slice(0, 10);
};

describe.skipIf(!hayEntornoIntegracion)(`HU-26 · promociones de la sede${hayEntornoIntegracion ? '' : ` (omitida: faltan ${faltantes.join(', ')})`}`, () => {
  let request, app, admin, slug;
  const ids = {};

  async function limpiar() {
    await admin.from('promociones').delete().like('nombre', `${ETIQUETA}%`); // promocion_servicios cae en cascada.
    await admin.from('servicios').delete().like('nombre', `${ETIQUETA}%`);
  }

  beforeAll(async () => {
    request = (await import('supertest')).default;
    app = (await import('../../src/app.js')).default;
    admin = (await import('../../src/config/supabase.js')).supabase;

    const { data: sedes } = await admin.from('establecimientos').select('id, slug').in('id', [EST_A, EST_B]).throwOnError();
    slug = (id) => sedes.find((s) => s.id === id).slug;

    await limpiar();
    const servicio = async (establecimiento_id, nombre) =>
      (await admin.from('servicios').insert({ establecimiento_id, nombre: `${ETIQUETA} ${nombre}`, precio: 30000, duracion_min: 30 }).select('id').single().throwOnError()).data;
    const promocion = async (establecimiento_id, servicioId, nombre, datos) => {
      const { data } = await admin
        .from('promociones')
        .insert({ establecimiento_id, nombre: `${ETIQUETA} ${nombre}`, descuento_pct: 20, fecha_inicio: dia(-1), fecha_fin: dia(10), activa: true, ...datos })
        .select('id')
        .single()
        .throwOnError();
      await admin.from('promocion_servicios').insert({ promocion_id: data.id, servicio_id: servicioId }).throwOnError();
      return data.id;
    };

    const motorA = await servicio(EST_A, 'Lavado de motor A');
    const motorB = await servicio(EST_B, 'Lavado de motor B');
    ids.vigenteA = await promocion(EST_A, motorA.id, 'Vigente A', { descripcion: 'Para la sede A', condiciones: 'Solo martes' });
    ids.terminaHoyA = await promocion(EST_A, motorA.id, 'Termina hoy A', { fecha_fin: dia(0) });
    ids.vencidaA = await promocion(EST_A, motorA.id, 'Vencida A', { fecha_inicio: dia(-10), fecha_fin: dia(-1) });
    ids.programadaA = await promocion(EST_A, motorA.id, 'Programada A', { fecha_inicio: dia(1), fecha_fin: dia(10) });
    ids.desactivadaA = await promocion(EST_A, motorA.id, 'Desactivada A', { activa: false });
    ids.vigenteB = await promocion(EST_B, motorB.id, 'Vigente B');
  });

  afterAll(async () => {
    if (admin) await limpiar();
  });

  const propias = (res) => res.body.promociones.filter((p) => p.nombre.startsWith(ETIQUETA));

  it('CA1: la sede A ve solo sus vigentes (incluida la que termina hoy); no las vencidas, programadas ni desactivadas', async () => {
    const res = await request(app).get(`/api/v1/publico/sedes/${slug(EST_A)}/promociones`);
    expect(res.status).toBe(200);
    expect(propias(res).map((p) => p.id).sort()).toEqual([ids.vigenteA, ids.terminaHoyA].sort());
  });

  it('CA2 / ESC-F5-07: A nunca ve promociones de B, y B nunca ve las de A', async () => {
    const [a, b] = await Promise.all([
      request(app).get(`/api/v1/publico/sedes/${slug(EST_A)}/promociones`),
      request(app).get(`/api/v1/publico/sedes/${slug(EST_B)}/promociones`),
    ]);
    expect(a.body.promociones.map((p) => p.id)).not.toContain(ids.vigenteB);
    expect(propias(b).map((p) => p.id)).toEqual([ids.vigenteB]);
    for (const id of [ids.vigenteA, ids.terminaHoyA]) expect(b.body.promociones.map((p) => p.id)).not.toContain(id);
  });

  it('CA3: la respuesta trae la marca de la sede consultada', async () => {
    const res = await request(app).get(`/api/v1/publico/sedes/${slug(EST_A)}/promociones`);
    expect(res.body.sede).toMatchObject({ slug: slug(EST_A) });
    expect(res.body.sede).toHaveProperty('logoUrl');
    expect(res.body.sede).toHaveProperty('colorPrimario');
    expect(res.body.sede).not.toHaveProperty('id');
  });

  it('cada promoción sale sin columnas internas ni condiciones', async () => {
    const res = await request(app).get(`/api/v1/publico/sedes/${slug(EST_A)}/promociones`);
    const vigente = res.body.promociones.find((p) => p.id === ids.vigenteA);
    expect(vigente).toEqual({
      id: ids.vigenteA,
      nombre: `${ETIQUETA} Vigente A`,
      descripcion: 'Para la sede A',
      descuentoPct: 20,
      fechaFin: dia(10),
      servicios: [`${ETIQUETA} Lavado de motor A`],
    });
    expect(JSON.stringify(res.body)).not.toContain(EST_A);
    expect(JSON.stringify(res.body)).not.toContain('Solo martes');
  });

  it('un slug inexistente responde 404', async () => {
    const res = await request(app).get('/api/v1/publico/sedes/no-existe-hu26/promociones');
    expect(res.status).toBe(404);
  });
});
