// HU-22: cada sede entrega su propia marca a la web móvil del cliente final, contra la API y Supabase.
// CA1: el logo y los colores configurados en el panel (HU-13) son los que recibe el cliente de esa sede,
// y nunca los de otra. Requiere backend/.env, backend/.env.spike.local y la migración hu17_enlace_publico_sede.
// Cambia la marca de las sedes de prueba A y B y la deja como estaba al terminar.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hayEntornoIntegracion, faltantes } from '../helpers/entorno.js';

const EST_A = '00000000-0000-0000-0000-00000000a058';
const EST_B = '00000000-0000-0000-0000-00000000b058';
const MARCA_A = { logo_url: 'https://ejemplo.test/logos/hu22-sede-a.png', color_primario: '#B91C1C', color_secundario: '#F59E0B' };
const MARCA_B = { logo_url: null, color_primario: '#2563EB', color_secundario: '#0EA5E9' }; // valores por defecto de la base

describe.skipIf(!hayEntornoIntegracion)(`HU-22 · marca de la sede en la app del cliente${hayEntornoIntegracion ? '' : ` (omitida: faltan ${faltantes.join(', ')})`}`, () => {
  let request, app, admin, originales, slug;

  beforeAll(async () => {
    request = (await import('supertest')).default;
    app = (await import('../../src/app.js')).default;
    admin = (await import('../../src/config/supabase.js')).supabase;

    const { data } = await admin
      .from('establecimientos')
      .select('id, slug, logo_url, color_primario, color_secundario')
      .in('id', [EST_A, EST_B])
      .throwOnError();
    originales = data;
    slug = (id) => data.find((s) => s.id === id).slug;

    await admin.from('establecimientos').update(MARCA_A).eq('id', EST_A).throwOnError();
    await admin.from('establecimientos').update(MARCA_B).eq('id', EST_B).throwOnError();
  });

  afterAll(async () => {
    for (const { id, logo_url, color_primario, color_secundario } of originales ?? []) {
      await admin.from('establecimientos').update({ logo_url, color_primario, color_secundario }).eq('id', id).throwOnError();
    }
  });

  it('CA1: el enlace de la sede A entrega el logo y los colores que A configuró en el panel', async () => {
    const res = await request(app).get(`/api/v1/publico/sedes/${slug(EST_A)}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      slug: slug(EST_A),
      logoUrl: MARCA_A.logo_url,
      colorPrimario: MARCA_A.color_primario,
      colorSecundario: MARCA_A.color_secundario,
    });
  });

  it('CA1: la sede B recibe su propia marca (sin logo, colores por defecto) y nada de la A', async () => {
    const res = await request(app).get(`/api/v1/publico/sedes/${slug(EST_B)}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ slug: slug(EST_B), logoUrl: null, colorPrimario: MARCA_B.color_primario, colorSecundario: MARCA_B.color_secundario });
    expect(JSON.stringify(res.body)).not.toContain(MARCA_A.logo_url);
    expect(JSON.stringify(res.body)).not.toContain(MARCA_A.color_primario);
  });

  it('las dos sedes consultadas a la vez no mezclan su marca', async () => {
    const [a, b] = await Promise.all([
      request(app).get(`/api/v1/publico/sedes/${slug(EST_A)}`),
      request(app).get(`/api/v1/publico/sedes/${slug(EST_B)}`),
    ]);
    expect(a.body.logoUrl).toBe(MARCA_A.logo_url);
    expect(b.body.logoUrl).toBeNull();
    expect(a.body.colorPrimario).not.toBe(b.body.colorPrimario);
  });

  it('un cambio de marca en el panel llega al cliente en la siguiente consulta', async () => {
    await admin.from('establecimientos').update({ color_primario: '#15803D' }).eq('id', EST_A).throwOnError();
    const res = await request(app).get(`/api/v1/publico/sedes/${slug(EST_A)}`);
    expect(res.body.colorPrimario).toBe('#15803D');
    await admin.from('establecimientos').update({ color_primario: MARCA_A.color_primario }).eq('id', EST_A).throwOnError();
  });

  it('la respuesta pública no expone el id ni datos internos de la sede', async () => {
    const res = await request(app).get(`/api/v1/publico/sedes/${slug(EST_A)}`);
    expect(Object.keys(res.body).sort()).toEqual(['colorPrimario', 'colorSecundario', 'logoUrl', 'nombre', 'slug']);
  });
});
