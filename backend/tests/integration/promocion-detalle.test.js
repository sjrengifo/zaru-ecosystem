// HU-27 · RF-F5-10: el cliente final abre el detalle de una promoción vigente de su sede, probado contra
// la API y Supabase. Requiere backend/.env, backend/.env.spike.local y la migración
// 20261101220000_hu12_promociones; sin ellos se omite.
// Crea sus propios servicios y promociones en las sedes de prueba A y B y los borra al terminar.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hayEntornoIntegracion, faltantes } from '../helpers/entorno.js';

const EST_A = '00000000-0000-0000-0000-00000000a058';
const EST_B = '00000000-0000-0000-0000-00000000b058';
const ETIQUETA = '[Prueba HU-27]';

/** Fecha relativa a hoy en Bogotá, en formato AAAA-MM-DD. */
const dia = (desplazamiento) => {
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
  const fecha = new Date(`${hoy}T12:00:00Z`);
  fecha.setUTCDate(fecha.getUTCDate() + desplazamiento);
  return fecha.toISOString().slice(0, 10);
};

describe.skipIf(!hayEntornoIntegracion)(`HU-27 · detalle de una promoción${hayEntornoIntegracion ? '' : ` (omitida: faltan ${faltantes.join(', ')})`}`, () => {
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
    ids.vigenteA = await promocion(EST_A, motorA.id, 'Vigente A', {
      descripcion: 'Descripción completa de la sede A',
      condiciones: 'Válida solo los martes. No acumulable.',
    });
    ids.sinTextosA = await promocion(EST_A, motorA.id, 'Sin textos A', {});
    ids.vencidaA = await promocion(EST_A, motorA.id, 'Vencida A', { fecha_inicio: dia(-10), fecha_fin: dia(-1) });
    ids.programadaA = await promocion(EST_A, motorA.id, 'Programada A', { fecha_inicio: dia(1), fecha_fin: dia(10) });
    ids.desactivadaA = await promocion(EST_A, motorA.id, 'Desactivada A', { activa: false });
    ids.vigenteB = await promocion(EST_B, motorB.id, 'Vigente B', { condiciones: 'Solo en la sede B' });
  });

  afterAll(async () => {
    if (admin) await limpiar();
  });

  const detalle = (idSede, idPromocion) => request(app).get(`/api/v1/publico/sedes/${slug(idSede)}/promociones/${idPromocion}`);

  it('CA1: una promoción vigente de la sede trae descripción completa, condiciones, descuento, servicios y vigencia', async () => {
    const res = await detalle(EST_A, ids.vigenteA);
    expect(res.status).toBe(200);
    expect(res.body.promocion).toEqual({
      id: ids.vigenteA,
      nombre: `${ETIQUETA} Vigente A`,
      descripcion: 'Descripción completa de la sede A',
      condiciones: 'Válida solo los martes. No acumulable.',
      descuentoPct: 20,
      fechaInicio: dia(-1),
      fechaFin: dia(10),
      servicios: [`${ETIQUETA} Lavado de motor A`],
    });
  });

  it('CA1: la respuesta trae la marca de la sede, sin ids internos', async () => {
    const res = await detalle(EST_A, ids.vigenteA);
    expect(res.body.sede).toMatchObject({ slug: slug(EST_A) });
    expect(res.body.sede).toHaveProperty('logoUrl');
    expect(res.body.sede).toHaveProperty('colorPrimario');
    expect(JSON.stringify(res.body)).not.toContain(EST_A);
  });

  it('sin descripción ni condiciones salen null', async () => {
    const res = await detalle(EST_A, ids.sinTextosA);
    expect(res.status).toBe(200);
    expect(res.body.promocion).toMatchObject({ descripcion: null, condiciones: null });
  });

  it('vencida, programada, desactivada, de otra sede, inexistente o con id inválido → el mismo 404', async () => {
    const casos = [
      detalle(EST_A, ids.vencidaA),
      detalle(EST_A, ids.programadaA),
      detalle(EST_A, ids.desactivadaA),
      detalle(EST_A, ids.vigenteB),
      detalle(EST_B, ids.vigenteA),
      detalle(EST_A, 'ffffffff-0000-4000-8000-000000000000'),
      detalle(EST_A, 'no-es-un-uuid'),
    ];
    const respuestas = await Promise.all(casos);
    for (const res of respuestas) {
      expect(res.status).toBe(404);
      expect(res.body.error).toMatchObject({ codigo: 'NO_ENCONTRADO', mensaje: 'Promoción no encontrada' });
    }
    expect(JSON.stringify(respuestas.map((r) => r.body))).not.toContain('Solo en la sede B');
  });

  it('un slug inexistente responde 404', async () => {
    const res = await request(app).get(`/api/v1/publico/sedes/no-existe-hu27/promociones/${ids.vigenteA}`);
    expect(res.status).toBe(404);
  });
});
